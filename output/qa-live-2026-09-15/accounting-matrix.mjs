import assert from 'node:assert/strict';import fs from 'node:fs';
import {paymentSplits,computeKPIs} from '../../server/lib/accounting.js';
const methods=['CASH','CARD','BIZUM','VOUCHER'];const results=[];
for(let mask=1;mask<16;mask++){
 const selected=methods.filter((_,i)=>mask&(1<<i));
 for(const value of [0.01,1,19.99,100]){
  const parts=selected.map(method=>({method,amount:value,...(method==='VOUCHER'?{voucherCode:'QA1234'}:{})}));const amount=Math.round(value*selected.length*100)/100;
  const payment=selected.length===1?{...parts[0],cashReceived:amount}:{method:'MIXED',amount,mixedPayments:parts};
  const splits=paymentSplits(payment);assert.equal(Math.round(splits.reduce((s,p)=>s+p.amount,0)*100),Math.round(amount*100));
  const k=computeKPIs([{type:'sale',...payment}],100);assert.equal(k.expectedCash,Math.round((100+(selected.includes('CASH')?value:0))*100)/100);results.push({methods:selected,amount,status:'pass'});
 }
}
const invalid=[{method:'CASH',amount:10,cashReceived:9},{method:'CARD',amount:-1},{method:'CARD',amount:1.001},{method:'OTHER',amount:1},{method:'VOUCHER',amount:1,voucherCode:''},{method:'MIXED',amount:10,mixedPayments:[]},{method:'MIXED',amount:10,mixedPayments:[{method:'CASH',amount:9}]},{method:'MIXED',amount:10,mixedPayments:[{method:'CASH',amount:0},{method:'CARD',amount:10}]}];for(const payment of invalid){assert.throws(()=>paymentSplits(payment));results.push({case:'reject',payment,status:'pass'});}
for(const method of ['CASH','CARD','VOUCHER']){const k=computeKPIs([{type:'refund',method,amount:19.99}],100);assert.equal(k.expectedCash,method==='CASH'?80.01:100);results.push({case:'refund',method,status:'pass'});}
const gaps=[];try{paymentSplits({method:'MIXED',amount:20,cashReceived:0,mixedPayments:[{method:'CASH',amount:10},{method:'CARD',amount:10}]});gaps.push('Mixed cash accepts cashReceived=0 for cash portion=10');}catch{}
fs.writeFileSync(new URL('./accounting-results.json',import.meta.url),JSON.stringify({passed:results.length,results,gaps},null,2));console.log({passed:results.length,gaps});
