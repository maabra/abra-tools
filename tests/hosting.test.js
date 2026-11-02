import test from 'node:test';
import assert from 'node:assert/strict';
import {hostingConfig, allowedRequest} from '../server/hosting.js';

test('Render listens on all interfaces and its assigned port', () => {
  assert.deepEqual(hostingConfig({RENDER:'true',PORT:'10000',RENDER_EXTERNAL_URL:'https://example.onrender.com'}), {
    origin:'https://example.onrender.com',hostname:'example.onrender.com',host:'0.0.0.0',port:10000,
  });
});
test('hosted API accepts same-origin HTTPS and rejects other origins and hosts', () => {
  const config=hostingConfig({RENDER_EXTERNAL_URL:'https://example.onrender.com'});
  assert.equal(allowedRequest(config,'example.onrender.com','https://example.onrender.com','example.onrender.com'),true);
  assert.equal(allowedRequest(config,'example.onrender.com',undefined,'example.onrender.com'),true);
  assert.equal(allowedRequest(config,'example.onrender.com','https://other.example','example.onrender.com'),false);
  assert.equal(allowedRequest(config,'evil.example',undefined,'evil.example'),false);
});
test('custom origin overrides Render hostname and local defaults remain private', () => {
  assert.equal(hostingConfig({PUBLIC_ORIGIN:'https://tools.example.com/',RENDER_EXTERNAL_URL:'https://example.onrender.com'}).hostname,'tools.example.com');
  const config=hostingConfig({});
  assert.equal(config.host,'127.0.0.1');
  assert.equal(allowedRequest(config,'localhost','http://localhost:3000','localhost:3000'),true);
  assert.equal(allowedRequest(config,'evil.example','http://evil.example','evil.example'),false);
});
