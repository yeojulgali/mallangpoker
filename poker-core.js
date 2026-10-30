/* 말랑포커 v2 | 2–5 player, host-authoritative, virtual-chip Texas Hold'em. */
(function(root,factory){const result=factory();if(typeof module==='object'&&module.exports)module.exports=result;root.PokerCore=result;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const STARTING_CHIPS=1000, SMALL_BLIND=10, BIG_BLIND=20, MAX_PLAYERS=5;
const SUITS=['♠','♥','♦','♣'],STREETS=['preflop','flop','turn','river'];
const RANK_NAMES=['하이 카드','원페어','투페어','트리플','스트레이트','플러시','풀하우스','포카드','스트레이트 플러시'];
function rand(max){if(typeof crypto!=='undefined'&&crypto.getRandomValues){const a=new Uint32Array(1),cap=Math.floor(4294967296/max)*max;do{crypto.getRandomValues(a)}while(a[0]>=cap);return a[0]%max;}return Math.floor(Math.random()*max);}
function deck(){const a=[];for(const suit of SUITS)for(let value=2;value<=14;value++)a.push({suit,value});for(let i=a.length-1;i>0;i--){const j=rand(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function straightHigh(values){const v=[...new Set(values)].sort((a,b)=>b-a);if(v.includes(14))v.push(1);let streak=1;for(let i=1;i<v.length;i++){streak=v[i-1]-v[i]===1?streak+1:1;if(streak>=5)return v[i-4];}return 0;}
function evaluateFive(cards){const vals=cards.map(c=>c.value).sort((a,b)=>b-a),flush=cards.every(c=>c.suit===cards[0].suit),straight=straightHigh(vals),counts=new Map();for(const v of vals)counts.set(v,(counts.get(v)||0)+1);const g=[...counts].sort((a,b)=>b[1]-a[1]||b[0]-a[0]);if(flush&&straight)return[8,straight];if(g[0][1]===4)return[7,g[0][0],g[1][0]];if(g[0][1]===3&&g[1][1]===2)return[6,g[0][0],g[1][0]];if(flush)return[5,...vals];if(straight)return[4,straight];if(g[0][1]===3)return[3,g[0][0],...g.slice(1).map(x=>x[0]).sort((a,b)=>b-a)];if(g[0][1]===2&&g[1][1]===2)return[2,...[g[0][0],g[1][0]].sort((a,b)=>b-a),g[2][0]];if(g[0][1]===2)return[1,g[0][0],...g.slice(1).map(x=>x[0]).sort((a,b)=>b-a)];return[0,...vals];}
function compareRanks(a,b){for(let i=0;i<Math.max(a.length,b.length);i++)if((a[i]||0)!==(b[i]||0))return(a[i]||0)>(b[i]||0)?1:-1;return 0;}
function evaluate(cards){if(!Array.isArray(cards)||cards.length<5)throw Error('카드가 5장 이상 필요해요.');let best=null;for(let a=0;a<cards.length-4;a++)for(let b=a+1;b<cards.length-3;b++)for(let c=b+1;c<cards.length-2;c++)for(let d=c+1;d<cards.length-1;d++)for(let e=d+1;e<cards.length;e++){const rank=evaluateFive([cards[a],cards[b],cards[c],cards[d],cards[e]]);if(!best||compareRanks(rank,best)>0)best=rank;}return best;}
function newPlayer(name,id){return{id:String(id),name:String(name||'플레이어').trim().slice(0,12),stack:STARTING_CHIPS,street:0,total:0,cards:[],folded:false,busted:false,connected:true,ready:false,acted:false};}
function createMatch(names=[]){const s={players:[],handNo:0,dealer:-1,stage:'waiting',deck:[],board:[],pot:0,currentBet:0,minRaise:BIG_BLIND,turn:null,pending:[],result:null,lastAction:'플레이어를 기다리는 중…',history:[]};names.forEach((name,i)=>addPlayer(s,name,'seat'+i));return s;}
function addPlayer(s,name,id){if(s.players.length>=MAX_PLAYERS)throw Error('최대 5명까지 입장할 수 있어요.');if(s.stage!=='waiting')throw Error('이미 게임이 시작됐어요.');if(s.players.some(p=>p.id===id))throw Error('중복 플레이어입니다.');const p=newPlayer(name,id);s.players.push(p);return s.players.length-1;}
function rename(s,idx,name){if(!s.players[idx])return;s.players[idx].name=String(name||'플레이어').trim().slice(0,12)||'플레이어';}
function eligible(s){return s.players.map((p,i)=>p.stack>0&&p.connected?i:-1).filter(i=>i!==-1);}
function nextIn(s,from,filter){for(let step=1;step<=s.players.length;step++){const idx=(from+step+s.players.length)%s.players.length;if(filter(idx))return idx;}return null;}
function deal(s,i){return s.deck.pop();}
function take(s,i,n){const p=s.players[i],v=Math.min(p.stack,Math.max(0,Math.trunc(n)));p.stack-=v;p.street+=v;p.total+=v;s.pot+=v;return v;}
function putBoard(s,n){s.deck.pop();for(let i=0;i<n;i++)s.board.push(s.deck.pop());}
function startHand(s){if(!['waiting','showdown','matchover'].includes(s.stage))throw Error('아직 판을 시작할 수 없어요.');const live=eligible(s);if(live.length<2)throw Error('칩이 남은 플레이어가 2명 이상 필요해요.');
 s.handNo++;s.dealer=nextIn(s,s.dealer,i=>live.includes(i));s.deck=deck();s.board=[];s.pot=0;s.currentBet=0;s.minRaise=BIG_BLIND;s.result=null;s.pending=[];
 for(const p of s.players){p.street=0;p.total=0;p.cards=[];p.folded=p.busted||!p.connected;p.acted=false;p.ready=false;}
 // Deal one card at a time clockwise, beginning left of the button.
 const order=[];let x=s.dealer;for(let i=0;i<live.length;i++){x=nextIn(s,x,j=>live.includes(j));order.push(x);}for(let round=0;round<2;round++)for(const i of order)s.players[i].cards.push(deal(s,i));
 const sb=live.length===2?s.dealer:nextIn(s,s.dealer,i=>live.includes(i));const bb=nextIn(s,sb,i=>live.includes(i));take(s,sb,SMALL_BLIND);take(s,bb,BIG_BLIND);s.currentBet=Math.max(...s.players.map(p=>p.street));
 s.stage='preflop';s.pending=live.filter(i=>s.players[i].stack>0);s.turn=nextIn(s,bb,i=>s.pending.includes(i));s.lastAction=`${s.handNo}번째 판 · 블라인드 10 / 20`;advance(s);return s;}
function able(s,i){const p=s.players[i];return p&&!p.folded&&p.stack>0;}
function livePlayers(s){return s.players.map((p,i)=>!p.folded?i:-1).filter(i=>i>=0);}
function advance(s){if(!STREETS.includes(s.stage))return s;const alive=livePlayers(s);if(alive.length===1)return settle(s,'fold');
 // Only one player can act: ask that player to match any outstanding bet, then run out.
 s.pending=s.pending.filter(i=>able(s,i));if(!s.pending.length){if(s.stage==='river')return settle(s,'showdown');nextStreet(s);return s;}
 if(s.turn===null||!s.pending.includes(s.turn))s.turn=nextIn(s,s.turn===null?s.dealer:s.turn,i=>s.pending.includes(i));return s;}
function nextStreet(s){if(s.stage==='river')return settle(s,'showdown');const idx=STREETS.indexOf(s.stage);s.stage=STREETS[idx+1];putBoard(s,idx===0?3:1);for(const p of s.players){p.street=0;p.acted=false;}s.currentBet=0;s.minRaise=BIG_BLIND;
 s.pending=s.players.map((p,i)=>able(s,i)?i:-1).filter(i=>i!==-1);s.turn=nextIn(s,s.dealer,i=>s.pending.includes(i));s.lastAction=({flop:'플롭 카드 3장 공개!',turn:'턴 카드 공개!',river:'리버 카드 공개!'})[s.stage];if(s.pending.length<=1){s.pending=[];return advance(s);}return s;}
function legalActions(s,i){const p=s.players[i],isTurn=!!p&&s.turn===i&&STREETS.includes(s.stage)&&able(s,i),toCall=p?Math.max(0,s.currentBet-p.street):0;
 const others=s.players.some((q,j)=>j!==i&&!q.folded&&q.stack>0),maxTarget=p?p.street+p.stack:0,minTarget=s.currentBet+s.minRaise;
 const canRaise=isTurn&&others&&!p.acted&&maxTarget>=minTarget;
 const canAllIn=isTurn&&p.stack>0&&(p.stack<=toCall||(others&&!p.acted));
 return{isTurn,toCall,callAmount:Math.min(toCall,p?.stack||0),canCheck:isTurn&&toCall===0,canCall:isTurn&&toCall>0,canFold:isTurn,canRaise,canAllIn,minTarget,maxTarget,raiseTo:Math.min(minTarget,maxTarget)};}
function action(s,i,type,amount){if(!Number.isInteger(i)||!s.players[i])throw Error('플레이어 오류');const L=legalActions(s,i),p=s.players[i];if(!L.isTurn)throw Error('지금은 내 차례가 아니에요.');
 if(type==='fold'){p.folded=true;p.acted=true;s.lastAction=`${p.name} 폴드`;s.pending=s.pending.filter(j=>j!==i);}
 else if(type==='check'){if(!L.canCheck)throw Error('체크할 수 없어요.');p.acted=true;s.pending=s.pending.filter(j=>j!==i);s.lastAction=`${p.name} 체크`;}
 else if(type==='call'){if(!L.canCall)throw Error('콜할 수 없어요.');const paid=take(s,i,L.toCall);p.acted=true;s.pending=s.pending.filter(j=>j!==i);s.lastAction=`${p.name} 콜 ${paid}칩`;}
 else if(type==='raise'||type==='allin'){
  if(type==='raise'&&!L.canRaise)throw Error('레이즈할 수 없어요.');if(type==='allin'&&!L.canAllIn)throw Error('올인할 수 없어요.');
  const target=type==='allin'?L.maxTarget:Number(amount);if(!Number.isSafeInteger(target)||(type==='raise'&&(target<L.minTarget||target>L.maxTarget)))throw Error(`레이즈는 ${L.minTarget}~${L.maxTarget}칩으로 설정해 주세요.`);
  const oldBet=s.currentBet,paid=take(s,i,target-p.street),increase=p.street-oldBet;
  if(increase>0){s.currentBet=p.street;if(increase>=s.minRaise){s.minRaise=increase;for(const q of s.players)q.acted=false;s.pending=s.players.map((q,j)=>j!==i&&able(s,j)?j:-1).filter(j=>j!==-1);}
   else {const pending=new Set(s.pending);for(let j=0;j<s.players.length;j++)if(j!==i&&able(s,j)&&s.players[j].street<s.currentBet)pending.add(j);s.pending=[...pending];}}
  s.pending=s.pending.filter(j=>j!==i);p.acted=true;s.lastAction=`${p.name} ${type==='allin'?'올인':'레이즈'} ${p.street}칩 (이번 라운드 합계)`;
 }else throw Error('지원하지 않는 행동이에요.');
 s.turn=nextIn(s,i,j=>s.pending.includes(j));return advance(s);}
function settle(s,type){const live=livePlayers(s);if(type==='showdown'&&s.board.length!==5)throw Error('공용 카드가 부족해요.');const rankings=s.players.map(p=>!p.folded&&type==='showdown'?evaluate([...p.cards,...s.board]):null);
 const levels=[...new Set(s.players.map(p=>p.total).filter(v=>v>0))].sort((a,b)=>a-b),payouts=s.players.map(()=>0),pots=[];
 let prev=0;for(const level of levels){const contributors=s.players.map((p,i)=>p.total>=level?i:-1).filter(i=>i>=0);const amount=(level-prev)*contributors.length;prev=level;if(amount<=0)continue;const eligible=contributors.filter(i=>!s.players[i].folded);if(!eligible.length)throw Error('팟에 승자가 없어요.');let winners=[eligible[0]];
 if(type==='showdown')for(const i of eligible.slice(1)){const c=compareRanks(rankings[i],rankings[winners[0]]);if(c>0)winners=[i];else if(c===0)winners.push(i);}
 const piece=Math.floor(amount/winners.length);for(const i of winners)payouts[i]+=piece;let odd=amount%winners.length;
 for(let step=1;step<=s.players.length&&odd>0;step++){const i=(s.dealer+step)%s.players.length;if(winners.includes(i)){payouts[i]++;odd--;}}pots.push({amount,winners});}
 s.players.forEach((p,i)=>p.stack+=payouts[i]);const busts=[];s.players.forEach((p,i)=>{if(p.stack===0&&!p.busted){p.busted=true;busts.push(i);}});
 const net=payouts.map((amount,i)=>amount-s.players[i].total);
 const winners=[...new Set(pots.filter(p=>p.amount>0).flatMap(p=>p.winners))];
 const matchover=eligible(s).length<2;
 const bestNet=Math.max(...net),leaders=net.map((n,i)=>n===bestNet&&n>0?i:-1).filter(i=>i>=0);
 const text=leaders.length===1?`${s.players[leaders[0]].name} 승리! 순이익 +${bestNet.toLocaleString('ko-KR')}칩`:leaders.length>1?'공동 승리! 팟을 나눴어요.':'팟 분배 완료!';
 s.result={type,winners,payouts,pots,ranks:rankings.map(r=>r?RANK_NAMES[r[0]]:null),busts,matchover,text};s.lastAction=text;s.stage=matchover?'matchover':'showdown';s.turn=null;s.pending=[];return s;}
function setReady(s,i){if(!s.players[i])throw Error('잘못된 플레이어');if(s.stage!=='showdown'&&s.stage!=='matchover')throw Error('지금은 준비할 수 없어요.');if(s.stage==='showdown'&&s.players[i].busted)return s;s.players[i].ready=true;
 const readyList=s.players.map((p,j)=>(s.stage==='matchover'||!p.busted)&&p.connected?j:-1).filter(j=>j>=0);
 if(readyList.length&&readyList.every(j=>s.players[j].ready)){
  if(s.stage==='matchover'){for(const p of s.players){p.stack=STARTING_CHIPS;p.busted=false;p.ready=false;}s.dealer=-1;s.handNo=0;}
  startHand(s);
 }return s;}
function disconnect(s,i){const p=s.players[i];if(!p)return s;p.connected=false;if(STREETS.includes(s.stage)&&!p.folded&&p.cards.length){if(s.turn===i)return action(s,i,'fold');p.folded=true;s.pending=s.pending.filter(j=>j!==i);advance(s);}return s;}
function reconnect(s,i){if(s.players[i])s.players[i].connected=true;return s;}
function publicView(s,i){return{handNo:s.handNo,dealer:s.dealer,stage:s.stage,board:s.board,pot:s.pot,currentBet:s.currentBet,turn:s.turn,lastAction:s.lastAction,
 players:s.players.map((p,j)=>({id:p.id,name:p.name,stack:p.stack,street:p.street,total:p.total,folded:p.folded,busted:p.busted,connected:p.connected,ready:p.ready,cards:(j===i||((s.stage==='showdown'||s.stage==='matchover')&&s.result?.type==='showdown'&&!p.folded))?p.cards:(p.cards.length?[null,null]:[])})),result:s.result,legal:legalActions(s,i),you:i};}
return{createMatch,addPlayer,rename,startHand,action,legalActions,publicView,evaluate,evaluateFive,compareRanks,straightHigh,deck,setReady,disconnect,reconnect,STARTING_CHIPS,MAX_PLAYERS};
});
