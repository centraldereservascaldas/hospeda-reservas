import test from 'node:test';import assert from 'node:assert/strict';
import {createBrowserQueue} from '../src/browser-query-queue.mjs';
const query={from:'2027-11-19',to:'2027-11-21',unit:'00109'};
test('browser queue refuses work without an active executor',()=>{
 const queue=createBrowserQueue();assert.throws(()=>queue.query(query),{code:'browser_worker_required'});
});
test('browser queue sends only validated search filters and matches the pending job',async()=>{
 const queue=createBrowserQueue();queue.next();
 const waiting=queue.query({...query,Action:'createHospedagem',password:'do-not-forward'});
 const job=queue.next();assert.deepEqual(job.query,{...query,guests:''});assert.equal(queue.getQuery(job.id).from,query.from);
 assert.equal(queue.submit('wrong-id',{},false),false);
 assert.equal(queue.submit(job.id,{status:'offers-found'},false),true);
 assert.deepEqual(await waiting,{status:'offers-found'});assert.equal(queue.status().pending,0);
});
test('browser queue rejects malformed filters and clears failed jobs',async()=>{
 const queue=createBrowserQueue();queue.next();assert.throws(()=>queue.query({...query,unit:'<script>'}),{code:'invalid_query'});
 const waiting=queue.query(query);const job=queue.next();queue.submit(job.id,null,true);
 await assert.rejects(()=>waiting,{code:'browser_query_failed'});assert.equal(queue.status().pending,0);
});
