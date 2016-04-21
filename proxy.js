#!/usr/bin/env node
"use strict";

const http = require('http');
const net = require('net');
const socks = require('socks');
const url = require('url');

const SOCKS_HOST = "127.0.0.1";
const SOCKS_PORT = 1080;

const BYPASS_HEADERS = ["connection", "proxy-connection", "transfer-encoding"];


function prepare_headers(headers) {
    for (let key of BYPASS_HEADERS) {
        delete headers[key];
    }
    return headers;
}

function doProxy(sReq, sRes) {
    console.log('Proxy', sReq.url);

    let sUrl = url.parse(sReq.url);
    let cOptions = {
        method   : sReq.method,
        hostname : sUrl.hostname,
        port     : sUrl.port || 80,
        path     : sUrl.path,
        headers  : prepare_headers(sReq.headers),
        agent    : new socks.Agent({
            proxy: {
                ipaddress: SOCKS_HOST,
                port: SOCKS_PORT,
                type: 5,
            }}),
    };

    let cReq = http.request(cOptions);
    cReq.on('response', (cRes) => {
        sRes.writeHead(cRes.statusCode, cRes.statusMessage,
                       prepare_headers(cRes.headers));
        cRes.pipe(sRes);
    });
    cReq.on('error', (err) => {
        console.error(err);
        sRes.end();
    });

    sReq.pipe(cReq);
}

function doTunnel(sReq, sSock) {
    console.log('Tunnel', sReq.url);

    let sUrl = url.parse(`http://${sReq.url}/`);
    let dOpts = {
        proxy: {
            ipaddress: SOCKS_HOST,
            port: SOCKS_PORT,
            type: 5,
        },
        target: {
            host: sUrl.hostname,
            port: sUrl.port || 80,
        },
    };

    socks.createConnection(dOpts, (err, dSock, info) => {
        if (err) {
            console.error(err);
            return sSock.end();
        }

        sSock.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        dSock.pipe(sSock);
        sSock.pipe(dSock);

        sSock.on('close', () => dSock.end());
        dSock.on('close', () => sSock.end());

        dSock.resume();
    });
}

let httpd = http.createServer();
httpd.on('request', doProxy);
httpd.on('connect', doTunnel);
httpd.listen(8080);
