import test from 'node:test';
import assert from 'node:assert/strict';
import {pages,number,twitterUrl,safeName} from '../server/utils.js';
test('page ranges preserve explicit order and repeats',()=>assert.deepEqual(pages('3, 1-2, 3',3),[2,0,1,2]));
test('empty range selects all pages',()=>assert.deepEqual(pages('',3),[0,1,2]));
test('invalid page ranges fail before copying',()=>{for(const value of ['0','4','3-1','1,,2','-1','2.5','1-99999999'])assert.throws(()=>pages(value,3));});
test('limits reject nonfinite and out of range numbers',()=>{for(const value of ['NaN','Infinity',-1,1001])assert.throws(()=>number(value,.1,1000,8));assert.equal(number('',.1,1000,8),8);});
test('Twitter links restricted to public post URLs',()=>{assert.equal(twitterUrl('https://x.com/alice/status/123?s=20'),'https://x.com/alice/status/123');for(const u of ['http://x.com/a/status/1','https://127.0.0.1/a/status/1','https://x.com.evil.com/a/status/1','https://x.com:4430/a/status/1','https://u:p@x.com/a/status/1','https://x.com/a/status/1/other'])assert.throws(()=>twitterUrl(u));});
test('download filenames cannot traverse paths',()=>assert.equal(safeName('../../a\\b.jpg'),'b.jpg'));
