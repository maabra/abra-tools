import test from 'node:test';
import assert from 'node:assert/strict';
import {frameRate,videoMetadata} from '../server/media-info.js';

test('fractional and invalid frame rates',()=>{
  assert.equal(frameRate('30000/1001'),30000/1001);
  for(const value of ['0/0','1/0','N/A',undefined,'',-10])assert.equal(frameRate(value),null);
});
test('duration prefers video stream, rotates portrait dimensions and uses average fps',()=>{
  const result=videoMetadata({format:{duration:'10'},streams:[
    {codec_type:'video',disposition:{attached_pic:1},width:100,height:100},
    {codec_type:'video',duration:'2.5',width:1920,height:1080,avg_frame_rate:'30000/1001',r_frame_rate:'60/1',side_data_list:[{rotation:-90}]},
    {codec_type:'audio'},
  ]});
  assert.deepEqual(result,{duration:2.5,width:1080,height:1920,fps:30000/1001,audio:true});
});
test('missing average fps falls back to nominal rate; unknown fps remains unknown',()=>{
  const data={format:{duration:'3'},streams:[{codec_type:'video',width:320,height:240,avg_frame_rate:'0/0',r_frame_rate:'12/1'}]};
  assert.equal(videoMetadata(data).fps,12);
  data.streams[0].r_frame_rate='0/0';assert.equal(videoMetadata(data).fps,null);
});
test('audio-only, missing duration and invalid dimensions fail clearly',()=>{
  assert.throws(()=>videoMetadata({streams:[{codec_type:'audio'}]}),/video stream/);
  assert.throws(()=>videoMetadata({streams:[{codec_type:'video',width:10,height:10}]}),/duration/);
  assert.throws(()=>videoMetadata({format:{duration:2},streams:[{codec_type:'video',width:0,height:1}]}),/dimensions/);
});
