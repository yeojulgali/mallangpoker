(function(){
'use strict';
const $ = id=>document.getElementById(id);
const C=window.PokerCore;
let peer=null, conn=null, isHost=false, match=null, view=null, roomCode='', nickname='';
let connectingTimer=null, reactionTimer=null, creating=false;
const stageLabels={waiting:'대기',preflop:'프리플롭',flop:'플롭',turn:'턴',river:'리버',showdown:'쇼다운'};
const fmt=num=>Number(num||0).toLocaleString('ko-KR');
function show(name){['lobby','waitScreen','gameScreen'].forEach(id=>$(id).classList.toggle('hidden',id!==name));}
function status(text,error=false){$('lobbyStatus').textContent=text;$('lobbyStatus').classList.toggle('error',error)}
function safeName(raw,base){return String(raw||'').trim().slice(0,12)||base;}
function newCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',r=new Uint32Array(6);if(crypto&&crypto.getRandomValues)crypto.getRandomValues(r);else for(let i=0;i<6;i++)r[i]=Math.floor(Math.random()*2**32);return Array.from(r,n=>chars[n%chars.length]).join('');}
function cleanup(){
 if(connectingTimer)clearTimeout(connectingTimer);connectingTimer=null;
 if(conn){try{conn.close()}catch(e){}conn=null;}
 if(peer){try{peer.destroy()}catch(e){}peer=null;}
 isHost=false;match=null;view=null;roomCode='';creating=false;
}
function leave(){cleanup();const u=new URL(location.href);u.searchParams.delete('room');history.replaceState(null,'',u.pathname+u.search+u.hash);status('');show('lobby')}
function connectUI(connected){$('connectionLabel').classList.toggle('off',!connected);$('connectionLabel').textContent=connected?'● 연결됨':'● 연결 끊김';}
function ensureLib(){if(typeof window.Peer!=='function'){status('연결 라이브러리를 불러오지 못했어요. 인터넷 연결 후 새로고침 해주세요.',true);return false;}return true;}
function addConnEvents(c){
 c.on('data',data=>{if(c!==conn)return;if(isHost)onHostMessage(data);else onGuestMessage(data)});
 c.on('close',()=>{if(c===conn)lostConnection()});
 c.on('error',()=>{if(c===conn)lostConnection()});
}
function lostConnection(){
 $('joinBtn').disabled=false;
 if(isHost){conn=null;connectUI(false);$('waitMessage').textContent='연결이 끊겼어요. 같은 코드로 다시 접속할 수 있어요.';show('waitScreen');}
 else {conn=null;connectUI(false);if(view){$('turnIndicator').textContent='연결이 끊겼어요. 다시 접속해 주세요.';disableButtons();$('nextHandBtn').disabled=true;}else {status('방에 연결하지 못했어요. 코드를 확인해 주세요.',true);show('lobby');}}
}
function hostRoom(){
 if(creating)return;
 if(!ensureLib())return;
 cleanup();creating=true;isHost=true;roomCode=newCode();nickname=safeName($('nickname').value,'방장');
 $('createBtn').disabled=true;status('방을 만드는 중…');
 peer=new Peer('mallang-poker-'+roomCode.toLowerCase());
 peer.on('open',()=>{
  creating=false;$('createBtn').disabled=false;
  $('roomCode').textContent=roomCode;$('shortRoom').textContent=roomCode;
  $('waitMessage').textContent='상대방의 입장을 기다리는 중…';
  status('');show('waitScreen');
 });
 peer.on('connection',incoming=>{
  if(conn&&conn.open){incoming.on('open',()=>{incoming.send({kind:'busy'});incoming.close();});return;}
  conn=incoming;
  addConnEvents(conn);
  incoming.on('open',()=>{
   connectUI(true);
   if(!match){match=C.createMatch([nickname,'손님']);C.newHand(match);}
   publish();show('gameScreen');
  });
 });
 peer.on('error',err=>{
  if(err.type==='unavailable-id'&&!conn){cleanup();$('createBtn').disabled=false;status('방 코드가 겹쳤어요. 다시 만들어 주세요.',true);show('lobby');}
  else if(!conn){cleanup();$('createBtn').disabled=false;status('방 생성에 실패했어요. 네트워크를 확인해 주세요.',true);show('lobby');}
 });
}
function joinRoom(raw){
 if(!ensureLib())return;
 const code=String(raw||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
 if(code.length!==6){status('방 코드는 6자리예요.',true);return;}
 cleanup();isHost=false;roomCode=code;nickname=safeName($('nickname').value,'손님');
 $('joinBtn').disabled=true;status('상대방의 방에 접속하는 중…');
 peer=new Peer();
 peer.on('open',()=>{
  conn=peer.connect('mallang-poker-'+roomCode.toLowerCase(),{reliable:true});
  addConnEvents(conn);
  conn.on('open',()=>{
   if(connectingTimer)clearTimeout(connectingTimer);
   $('joinBtn').disabled=false;status('');
   $('shortRoom').textContent=roomCode;conn.send({kind:'hello',name:nickname});
   connectUI(true);show('gameScreen');
  });
  connectingTimer=setTimeout(()=>{
   if(!conn?.open){cleanup();$('joinBtn').disabled=false;status('방에 접속하지 못했어요. 상대방이 방을 열어뒀는지 확인해 주세요.',true);show('lobby');}
  },18000);
 });
 peer.on('error',()=>{
  cleanup();$('joinBtn').disabled=false;status('방을 찾지 못했어요. 코드 또는 네트워크를 확인해 주세요.',true);show('lobby');
 });
}
function send(data){try{if(conn&&conn.open)conn.send(data)}catch(e){lostConnection()}}
function onHostMessage(data){
 if(!data||typeof data!=='object')return;
 if(data.kind==='hello'){
  match.players[1].name=safeName(data.name,'손님');publish();
 } else if(data.kind==='action'){
  try{
   if(typeof data.action!=='string'||!['fold','check','call','raise','allin'].includes(data.action))return;
   C.action(match,1,data.action);publish();
  }catch(e){send({kind:'error',text:e.message});publish();}
 } else if(data.kind==='next'){
  if(match.stage==='showdown'){C.newHand(match);publish();}
 } else if(data.kind==='reaction'){
  if(['♥','👏','😎'].includes(data.emoji)){toast(data.emoji);send({kind:'reaction',emoji:data.emoji});}
 }
}
function onGuestMessage(data){
 if(!data||typeof data!=='object')return;
 if(data.kind==='state'){view=data.view;render();}
 else if(data.kind==='busy'){cleanup();status('이미 두 명이 게임 중인 방이에요.',true);show('lobby')}
 else if(data.kind==='error'){if(data.text)toast('⚠️')}
 else if(data.kind==='reaction'&&['♥','👏','😎'].includes(data.emoji))toast(data.emoji);
}
function publish(){if(!match)return;view=C.publicView(match,0);render();send({kind:'state',view:C.publicView(match,1)});}
function perform(type){
 if(!view||!view.legal?.isTurn)return;
 if(isHost){try{C.action(match,0,type);publish()}catch(e){console.warn(e.message)}}
 else send({kind:'action',action:type});
}
function nextHand(){if(!view||view.stage!=='showdown')return;if(isHost){C.newHand(match);publish()}else send({kind:'next'});}
function cardMarkup(card){
 if(card===undefined)return '<span class="playing-card blank" aria-hidden="true"></span>';
 if(card===null)return '<span class="playing-card back" aria-label="뒷면 카드"></span>';
 const v=card.value===14?'A':card.value===13?'K':card.value===12?'Q':card.value===11?'J':String(card.value);
 const red=card.suit==='♥'||card.suit==='♦';
 return `<span class="playing-card ${red?'red':''}" aria-label="${v} ${card.suit}"><span class="corner">${v}<span>${card.suit}</span></span><span class="suit-big">${card.suit}</span></span>`;
}
function playerCards(cards){return (cards||[null,null]).map(cardMarkup).join('');}
function disableButtons(){['foldBtn','checkCallBtn','raiseBtn','allInBtn'].forEach(id=>$(id).disabled=true)}
function render(){
 if(!view)return;
 const me=view.you,other=1-me,p=view.players[me],o=view.players[other];
 $('myName').textContent=p.name+' (나)';$('opponentName').textContent=o.name;
 $('myStack').innerHTML=fmt(p.stack)+' <small>칩</small>';
 $('opponentStack').innerHTML=fmt(o.stack)+' <small>칩</small>';
 $('myDealer').textContent=view.dealer===me?'딜러 · 스몰 블라인드':'빅 블라인드';
 $('opponentDealer').textContent=view.dealer===other?'딜러 · 스몰 블라인드':'빅 블라인드';
 $('myCards').innerHTML=playerCards(p.cards);
 $('opponentCards').innerHTML=playerCards(o.cards);
 $('communityCards').innerHTML=Array.from({length:5},(_,i)=>cardMarkup(view.board[i])).join('');
 $('selfBet').textContent=p.street?`이번 라운드 베팅 ${fmt(p.street)}칩`:'';
 $('opponentBet').textContent=o.street?`이번 라운드 베팅 ${fmt(o.street)}칩`:'';
 $('potValue').textContent=fmt(view.pot);
 $('streetLabel').textContent=stageLabels[view.stage]||'';
 $('lastAction').textContent=view.lastAction||'포커 한 판 즐겨요 ♡';
 $('selfBox').classList.toggle('active',view.turn===me);
 $('opponentBox').classList.toggle('active',view.turn===other);
 const finished=view.stage==='showdown';
 $('actionButtons').classList.toggle('hidden',finished);
 $('nextHandBtn').classList.toggle('hidden',!finished);
 $('resultPanel').classList.toggle('hidden',!finished);
 if(finished){
  $('nextHandBtn').disabled=!conn?.open;
  $('resultText').textContent=view.result?.text||'게임 종료';
  const ranks=view.result?.ranks;
  $('rankText').textContent=ranks?`${view.players[0].name}: ${ranks[0]} · ${view.players[1].name}: ${ranks[1]}`:'상대방이 폴드했어요.';
  $('turnIndicator').textContent=view.result?.winner===null?'사이좋게 무승부 ♡':view.result?.winner===me?'이번 판은 내 승리! ♥':'이번 판은 상대의 승리!';
 }else{
  const L=view.legal;
  $('turnIndicator').textContent=L?.isTurn?'내 차례예요! 어떤 선택을 할까요?':'상대방의 선택을 기다리는 중…';
  $('foldBtn').disabled=!L?.canFold;
  $('checkCallBtn').disabled=!(L?.canCheck||L?.canCall);
  $('checkCallBtn').textContent=L?.toCall?`콜 ${fmt(L.callAmount)}칩`:'체크';
  $('raiseBtn').disabled=!L?.canRaise;
  $('raiseBtn').textContent=L?.canRaise?`레이즈 · ${fmt(L.raiseTo)}칩`:'레이즈 불가';
  $('allInBtn').disabled=!L?.canAllIn;
  $('allInBtn').textContent=`최대 베팅 · ${fmt(L?.maxTarget||0)}`;
 }
}
function toast(content){
 const el=$('reactionToast');el.textContent=content;el.classList.add('hidden');void el.offsetWidth;el.classList.remove('hidden');
 clearTimeout(reactionTimer);reactionTimer=setTimeout(()=>el.classList.add('hidden'),2200);
}
function reaction(emoji){if(!conn?.open)return;toast(emoji);send({kind:'reaction',emoji});}
$('createBtn').addEventListener('click',hostRoom);
$('joinBtn').addEventListener('click',()=>joinRoom($('roomInput').value));
$('roomInput').addEventListener('keyup',e=>{if(e.key==='Enter')joinRoom($('roomInput').value)});
$('copyCodeBtn').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(roomCode);$('copyCodeBtn').textContent='복사 완료 ♡';setTimeout(()=>$('copyCodeBtn').textContent='코드 복사하기',1800)}catch(e){$('copyCodeBtn').textContent='코드: '+roomCode}});
$('shareBtn').addEventListener('click',async()=>{
 const invite=new URL(location.href);invite.searchParams.set('room',roomCode);
 if(navigator.share){try{await navigator.share({title:'말랑포커 같이 하자 ♡',text:'방 코드 '+roomCode,url:invite.toString()})}catch(e){}}
 else {try{await navigator.clipboard.writeText(invite.toString());$('shareBtn').textContent='링크 복사 완료 ♡';setTimeout(()=>$('shareBtn').textContent='초대 링크 공유하기',1800)}catch(e){status('링크를 복사할 수 없어요.',true)}}
});
$('leaveWaitBtn').addEventListener('click',leave);
$('leaveGameBtn').addEventListener('click',()=>{if(confirm('게임에서 나갈까요? 현재 판이 종료될 수 있어요.'))leave()});
$('foldBtn').addEventListener('click',()=>perform('fold'));
$('checkCallBtn').addEventListener('click',()=>perform(view?.legal?.toCall?'call':'check'));
$('raiseBtn').addEventListener('click',()=>perform('raise'));
$('allInBtn').addEventListener('click',()=>perform('allin'));
$('nextHandBtn').addEventListener('click',nextHand);
document.querySelectorAll('[data-reaction]').forEach(button=>button.addEventListener('click',()=>reaction(button.dataset.reaction)));
const dlg=$('rulesDialog');$('rulesBtn').addEventListener('click',()=>dlg.showModal());$('closeRulesBtn').addEventListener('click',()=>dlg.close());$('okayRulesBtn').addEventListener('click',()=>dlg.close());
const inviteCode=new URL(location.href).searchParams.get('room');if(inviteCode&&/^[A-Za-z0-9]{6}$/.test(inviteCode)){$('roomInput').value=inviteCode.toUpperCase();status('초대받은 방 코드가 입력됐어요. 입장하기를 눌러주세요.');}
if('serviceWorker' in navigator && /^https?:$/.test(location.protocol))window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));
})();
