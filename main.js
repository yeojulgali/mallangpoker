(function(){'use strict';
const $=id=>document.getElementById(id),C=window.PokerCore,STAGE={waiting:'대기실',preflop:'프리플롭',flop:'플롭',turn:'턴',river:'리버',showdown:'쇼다운',matchover:'게임 종료'};
const CHATS=['빨리좀 고르세요!','🥱','안좋은 한판이네요'];
let peer=null,connection=null,host=false,room='',nickname='',match=null,view=null,connections=new Map(),seats=new Map(),pendingTimer=null;
let lastHand=-1,lastBoardCount=0,lastStage='',lastBusted='',betValue=40,currentBetKey='',lastAnnounceTimer=null;
let retryTimer=null,retryCount=0,joining=false,lastChatSent=0;
const fmt=n=>Number(n||0).toLocaleString('ko-KR');const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeName=(name,fallback)=>String(name||'').trim().slice(0,12)||fallback;
const randomToken=(len)=>{const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',a=new Uint32Array(len);crypto.getRandomValues(a);return Array.from(a,n=>chars[n%chars.length]).join('');};
function token(){let t;try{t=sessionStorage.getItem('mallang-token');if(!t){t=randomToken(20);sessionStorage.setItem('mallang-token',t)}}catch(_){t=randomToken(20)}return t;}
function show(id){for(const el of ['lobby','waitScreen','gameScreen'])$(el).classList.toggle('hidden',el!==id);}
function lobbyStatus(t){$('lobbyStatus').textContent=t||'';}
function netLabel(connected){$('connectionLabel').textContent=connected?'● 연결됨':'● 연결 안 됨';$('connectionLabel').classList.toggle('offline',!connected);}
function reset(){if(pendingTimer)clearTimeout(pendingTimer);if(retryTimer)clearTimeout(retryTimer);retryTimer=null;retryCount=0;joining=false;if(connection){try{connection.close()}catch(_){}}for(const c of connections.keys())try{c.close()}catch(_){}connections.clear();seats.clear();if(peer)try{peer.destroy()}catch(_){}peer=null;connection=null;host=false;room='';match=null;view=null;lastHand=-1;lastBoardCount=0;lastStage='';lastBusted='';currentBetKey='';$('createBtn').disabled=false;$('joinBtn').disabled=false;}
function leave(){reset();const url=new URL(location.href);url.searchParams.delete('room');history.replaceState({},'',url.pathname+url.search+url.hash);show('lobby');lobbyStatus('');}
function send(c,data){if(c&&c.open)try{c.send(data)}catch(_){}}
function ensurePeer(){if(typeof Peer!=='function'){lobbyStatus('온라인 연결 라이브러리가 불러와지지 않았어요. 인터넷 연결을 확인해 주세요.');return false;}return true;}
function updateSeats(){if(!view)return;const players=view.players,connected=players.filter(p=>p.connected).length;
 $('playerCount').textContent=`${connected}/5명`;
 $('waitingPlayers').innerHTML=players.map((p,i)=>`<div class="wait-player ${p.connected?'':'muted'}"><span class="seat-emoji">${['🐰','🐻','🐱','🐼','🦊'][i]}</span><span>${safe(p.name)}${i===0?' <small>방장</small>':''}</span><b>${p.connected?'● 접속':'○ 오프라인'}</b></div>`).join('');
 $('waitMessage').textContent=host?(connected>=2?'친구들이 준비됐어요. 시작 버튼을 눌러주세요.':'최소 2명이 접속해야 게임을 시작할 수 있어요.'):'방장이 게임을 시작하기를 기다리는 중…';
 $('startBtn').classList.toggle('hidden',!host);$('startBtn').disabled=connected<2;}
function publish(){if(!match)return;view=C.publicView(match,0);render();for(const [c,i] of connections)send(c,{kind:'state',view:C.publicView(match,i)});}
function addConnection(c){c.on('data',data=>handleHost(c,data));c.on('close',()=>disconnectGuest(c));c.on('error',()=>disconnectGuest(c));}
function disconnectGuest(c){if(!connections.has(c))return;const idx=connections.get(c);connections.delete(c);
 if(idx!==undefined&&match?.players[idx]){C.disconnect(match,idx);if(match.stage==='waiting'){match.players.splice(idx,1);for(const [other,j] of connections)if(j>idx)connections.set(other,j-1);}publish();}}
function handleHost(c,d){if(!d||typeof d!=='object')return;
 if(d.kind==='hello'){
  const id='g-'+String(d.token||'').slice(0,40);if(!/^g-[A-Z2-9]{16,40}$/.test(id)){send(c,{kind:'denied',message:'입장 정보가 올바르지 않아요.'});c.close();return;}
  let i=match.players.findIndex(p=>p.id===id);
  if(i<0){if(match.stage!=='waiting'||match.players.length>=C.MAX_PLAYERS){send(c,{kind:'denied',message:'게임이 시작됐거나 방이 가득 찼어요.'});setTimeout(()=>c.close(),200);return;}try{i=C.addPlayer(match,safeName(d.name,'친구'),id);}catch(e){send(c,{kind:'denied',message:e.message});return;}}
  else{for(const [old,j] of connections){if(j===i){connections.delete(old);try{old.close()}catch(_){}}}C.reconnect(match,i);}
  C.rename(match,i,safeName(d.name,'친구'));connections.set(c,i);send(c,{kind:'welcome',index:i,room});publish();return;
 }
 const i=connections.get(c);if(i===undefined||!match?.players[i])return;
 try{
  if(d.kind==='action'){if(!['fold','check','call','raise','allin'].includes(d.type))return;C.action(match,i,d.type,d.amount);publish();}
  else if(d.kind==='ready'){C.setReady(match,i);publish();}
  else if(d.kind==='chat'){if(CHATS.includes(d.text)){broadcastChat(match.players[i].name,d.text);}}
 }catch(e){send(c,{kind:'error',message:e.message});publish();}}
function broadcastChat(name,msg){toast(`${name}: ${msg}`);for(const c of connections.keys())send(c,{kind:'chat',name,msg});}
function hostRoom(){if(!ensurePeer())return;reset();host=true;nickname=safeName($('nickname').value,'방장');room=randomToken(6);match=C.createMatch([nickname]);match.players[0].id='host';$('createBtn').disabled=true;lobbyStatus('방을 생성하는 중…');
 peer=new Peer('mallang-poker-'+room.toLowerCase());
 peer.on('open',()=>{ $('roomCode').textContent=room;$('shortRoom').textContent=room;lobbyStatus('');publish();});
 peer.on('connection',c=>{addConnection(c);});
 peer.on('error',e=>{if(match?.stage==='waiting'){const msg=e?.type==='unavailable-id'?'방 코드가 중복됐어요. 다시 시도해 주세요.':'방을 만들 수 없어요. 네트워크를 확인해 주세요.';reset();show('lobby');lobbyStatus(msg);}else toast('연결 오류가 발생했어요.');});
}
function joinRoom(raw){if(!ensurePeer())return;const code=String(raw||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(code.length!==6){lobbyStatus('방 코드는 6자리예요.');return;}
 reset();host=false;room=code;nickname=safeName($('nickname').value,'친구');$('joinBtn').disabled=true;lobbyStatus('접속하는 중…');joining=true;peer=new Peer();
 peer.on('open',()=>connectGuest());
 peer.on('disconnected',()=>{if(!host&&peer){netLabel(false);try{peer.reconnect();}catch(_){}}});
 peer.on('error',e=>{if(!peer||host)return;if(!view&&retryCount>=4){leave();lobbyStatus('방을 찾지 못했어요. 코드를 확인해 주세요.');return;}guestOffline(connection);});
}
function connectGuest(){if(host||!peer||!room)return;
 if(retryTimer){clearTimeout(retryTimer);retryTimer=null;}
 try{const c=peer.connect('mallang-poker-'+room.toLowerCase(),{reliable:true,serialization:'json'});connection=c;
 c.on('open',()=>{if(connection!==c)return;if(pendingTimer)clearTimeout(pendingTimer);retryCount=0;joining=false;send(c,{kind:'hello',token:token(),name:nickname});netLabel(true);});
 c.on('data',data=>{if(connection!==c||!data||typeof data!=='object')return;
  if(data.kind==='welcome'){$('shortRoom').textContent=room;$('roomCode').textContent=room;}
  else if(data.kind==='state'){if(pendingTimer)clearTimeout(pendingTimer);view=data.view;lobbyStatus('');render();}
  else if(data.kind==='denied'){const msg=data.message;leave();lobbyStatus(msg);}
  else if(data.kind==='error')toast(data.message||'다시 시도해 주세요.');
  else if(data.kind==='chat'&&CHATS.includes(data.msg))toast(`${data.name}: ${data.msg}`);
 });
 c.on('close',()=>guestOffline(c));c.on('error',()=>guestOffline(c));
 pendingTimer=setTimeout(()=>{if(peer&&!host&&connection===c&&!view){guestOffline(c);}},10000);
 }catch(_){guestOffline(connection);}
}
function guestOffline(c){if(host||!peer||(c&&c!==connection))return;
 netLabel(false);disableActions();
 if(view){$('turnIndicator').textContent='연결이 끊겼어요. 다시 접속을 시도하고 있어요…';}
 else lobbyStatus('방에 다시 접속하는 중…');
 if(retryTimer)return;
 if(retryCount>=8){if(!view){leave();lobbyStatus('방에 연결할 수 없어요. 코드와 방장 접속 상태를 확인해 주세요.');}
 else $('turnIndicator').textContent='연결이 끊겼어요. 방장이 온라인인지 확인하고 새로고침해 주세요.';return;}
 const backoff=Math.min(750*(2**Math.min(retryCount,3)),6000);retryCount++;
 retryTimer=setTimeout(()=>{retryTimer=null;if(!peer||host)return;
  if(peer.disconnected){try{peer.reconnect();}catch(_){}}
  if(peer.open)connectGuest();else guestOffline(null);
 },backoff);
}
function perform(type){if(!view?.legal?.isTurn)return;const amount=type==='raise'?Number($('raiseAmount').value):undefined;
 if(type==='raise'&&(!Number.isSafeInteger(amount)||amount<view.legal.minTarget||amount>view.legal.maxTarget)){toast(`베팅 금액은 ${fmt(view.legal.minTarget)}~${fmt(view.legal.maxTarget)}칩이에요.`);return;}
 if(host){try{C.action(match,0,type,amount);publish();}catch(e){toast(e.message);}}
 else send(connection,{kind:'action',type,amount});}
function ready(){if(!view||!['showdown','matchover'].includes(view.stage))return;if(host){try{C.setReady(match,0);publish()}catch(e){toast(e.message)}}else send(connection,{kind:'ready'});}
function cardMarkup(c,kind='',animate=false){if(c===undefined)return '<span class="playing-card empty"></span>';if(c===null)return '<span class="playing-card card-back">♥</span>';
 const v=c.value===14?'A':c.value===13?'K':c.value===12?'Q':c.value===11?'J':String(c.value),red=c.suit==='♥'||c.suit==='♦';
 return `<span class="playing-card ${kind} ${red?'red':''} ${animate?'flip-in':''}" aria-label="${v} ${safe(c.suit)}"><span class="card-corner">${v}<small>${safe(c.suit)}</small></span><strong>${safe(c.suit)}</strong></span>`;}
function disableActions(){for(const id of ['foldBtn','checkCallBtn','raiseBtn','allInBtn','raiseAmount','raiseRange','minusBet','plusBet'])$(id).disabled=true;}
function setBet(n){if(!view?.legal)return;const L=view.legal,min=L.minTarget,max=L.maxTarget;betValue=Math.max(min,Math.min(max,Number.isFinite(n)?Math.round(n):min));$('raiseAmount').value=betValue;$('raiseRange').value=betValue;$('raiseDisplay').textContent=`${fmt(betValue)}칩`;
 $('raiseBtn').textContent=`${view.currentBet>0?'레이즈':'베팅'} ${fmt(betValue)}칩`;}
function drawBetEditor(){const L=view.legal,enabled=!!L?.canRaise;$('betEditor').classList.toggle('hidden',!enabled);if(!enabled)return;
 const key=`${view.handNo}-${view.stage}-${view.turn}-${view.currentBet}-${L.minTarget}-${L.maxTarget}`;
 if(currentBetKey!==key){currentBetKey=key;betValue=L.minTarget;}
 $('raiseTitle').textContent=view.currentBet?'레이즈 총액':'베팅 총액';$('raiseRange').min=L.minTarget;$('raiseRange').max=L.maxTarget;$('raiseRange').step=1;$('raiseAmount').min=L.minTarget;$('raiseAmount').max=L.maxTarget;
 $('minBetLabel').textContent=`최소 ${fmt(L.minTarget)}칩`;$('maxBetLabel').textContent=`최대 ${fmt(L.maxTarget)}칩`;setBet(betValue);
 $('minusBet').disabled=$('plusBet').disabled=$('raiseAmount').disabled=$('raiseRange').disabled=!L.isTurn;
}
function renderOpponents(v){const me=v.you,players=v.players;const others=players.map((p,i)=>({...p,index:i})).filter(p=>p.index!==me);
 $('opponentGrid').innerHTML=others.map((p,j)=>`<div class="opponent-seat ${p.index===v.turn?'playing-now':''} ${p.busted?'is-busted':''} ${!p.connected?'is-offline':''}">
  <div class="seat-top"><span class="seat-emoji">${['🐰','🐻','🐱','🐼','🦊'][p.index]}</span><div class="seat-detail"><b>${safe(p.name)}${p.index===v.dealer?' <i class="dealer-button">D</i>':''}</b><small>${p.busted?'파산 · 관전':!p.connected?'연결 끊김':p.folded?'폴드':`${fmt(p.stack)}칩`}</small></div></div>
  <div class="mini-cards">${(p.cards||[]).map(c=>cardMarkup(c,'mini')).join('')}</div><div class="seat-bet">${p.street?`베팅 ${fmt(p.street)}`:p.ready?'준비 ✓':''}</div></div>`).join('');}
function animationForNewHand(playersCount){$('dealerLine').textContent='제가 직접 카드 나눠드릴게요!';const face=$('dealerPortrait');face.classList.remove('dealing');void face.offsetWidth;face.classList.add('dealing');
 const layer=$('flyingCards');layer.innerHTML='';for(let i=0;i<Math.min(playersCount,5)*2;i++){const card=document.createElement('span');card.className='flying-card';card.textContent='♥';card.style.setProperty('--n',String(i));card.style.setProperty('--dx',`${((i%playersCount)/(Math.max(playersCount-1,1))-.5)*210}px`);card.style.setProperty('--dy',`${(i%playersCount)%2===0?-110:110}px`);layer.appendChild(card);}setTimeout(()=>{layer.innerHTML='';},1900);}
function announce(message){const el=$('announce');el.textContent=message;el.classList.remove('hidden');void el.offsetWidth;el.classList.add('appear');clearTimeout(lastAnnounceTimer);lastAnnounceTimer=setTimeout(()=>{el.classList.add('hidden');el.classList.remove('appear');},3100);}
function render(){if(!view)return;const v=view,players=v.players,p=players[v.you];$('shortRoom').textContent=room;
 if(v.stage==='waiting'){show('waitScreen');updateSeats();return;}
 show('gameScreen');netLabel(host||!!connection?.open);
 const changingHand=v.handNo!==lastHand,addingBoard=v.board.length>lastBoardCount&&!changingHand;
 if(changingHand){lastHand=v.handNo;lastBoardCount=0;currentBetKey='';animationForNewHand(players.filter(p=>p.cards?.length).length);}
 if(addingBoard)$('dealerLine').textContent=v.stage==='flop'?'플롭, 세 장을 공개합니다!':v.stage==='turn'?'턴 카드 공개!': '리버, 마지막 카드입니다!';
 if(v.stage!==lastStage){lastStage=v.stage;if(v.stage==='matchover')announce(`${players.filter(p=>p.stack>0&&p.connected).map(p=>p.name).join(', ')} 최종 우승!`);}
 renderOpponents(v);$('myName').textContent=p.name+' (나)';$('myStack').textContent=fmt(p.stack);$('myDealer').textContent=p.busted?'파산 · 관전 중':v.dealer===v.you?'딜러 D':p.folded?'폴드':'플레이어';
 $('selfBox').classList.toggle('playing-now',v.turn===v.you);$('selfBox').classList.toggle('is-busted',p.busted);
 $('myCards').innerHTML=(p.cards||[]).map(c=>cardMarkup(c,'large')).join('');$('selfBet').textContent=p.street?`이번 라운드에 ${fmt(p.street)}칩 베팅`:p.busted?'파산했습니다 · 관전 중':'';
 $('communityCards').innerHTML=Array.from({length:5},(_,i)=>cardMarkup(v.board[i],'community',addingBoard&&i>=lastBoardCount)).join('');lastBoardCount=v.board.length;
 $('potValue').textContent=fmt(v.pot);$('streetLabel').textContent=STAGE[v.stage]||'';$('lastAction').textContent=v.lastAction||'';
 const done=v.stage==='showdown'||v.stage==='matchover';$('actionButtons').classList.toggle('hidden',done||p.busted);$('betEditor').classList.toggle('hidden',done||p.busted||!v.legal?.canRaise);
 $('resultPanel').classList.toggle('hidden',!done);$('nextPanel').classList.toggle('hidden',!done);
 if(done){const r=v.result;$('resultText').textContent=r?.text||'이번 판 종료';$('rankText').textContent=r?.ranks?.map((x,i)=>x?`${players[i].name}: ${x}`:null).filter(Boolean).join(' · ')||(r?.type==='fold'?'상대가 폴드했어요.':'');
 $('bustText').textContent=(r?.busts||[]).map(i=>`💥 ${players[i].name} 파산!!`).join(' ');const bustKey=`${v.handNo}-${(r?.busts||[]).join(',')}`;
 if(r?.busts?.length&&lastBusted!==bustKey){lastBusted=bustKey;announce(r.busts.map(i=>`${players[i].name} 파산!!`).join(' '));}
 const isFinal=v.stage==='matchover',voters=players.filter(q=>q.connected&&(isFinal||!q.busted));$('nextQuestion').textContent=isFinal?'다시하시겠습니까?':'다음 판을 하시겠습니까?';
 $('nextHandBtn').textContent=p.ready?'준비 완료 ✓':isFinal?'네! 새 게임 시작':'다음 판 준비 ✓';$('nextHandBtn').disabled=p.ready||(!isFinal&&p.busted)||(!host&&!connection?.open);
 $('readyStatus').textContent=(!isFinal&&p.busted)?'파산했습니다. 이제 다른 친구들을 관전할 수 있어요.':`${voters.filter(q=>q.ready).length}/${voters.length}명 준비 완료`;
 $('turnIndicator').textContent=isFinal?'최종 우승자가 결정됐어요!':p.busted?'파산했습니다 · 관전 중':r?.winners?.includes(v.you)?'이번 판 팟을 가져왔어요!':'이번 판이 끝났어요.';
 }else{const L=v.legal;$('turnIndicator').textContent=p.busted?'파산했습니다 · 관전 중':p.folded?'폴드 · 이번 판 관전 중':L?.isTurn?'✨ 내 차례! 카드를 선택해 주세요.':`${players[v.turn]?.name||'다른 플레이어'}님의 차례를 기다리는 중…`;
 $('foldBtn').disabled=!L?.canFold;$('checkCallBtn').disabled=!(L?.canCheck||L?.canCall);$('checkCallBtn').textContent=L?.toCall?`콜 ${fmt(L.callAmount)}칩`:'체크';$('raiseBtn').disabled=!L?.canRaise;$('allInBtn').disabled=!L?.canAllIn;$('allInBtn').textContent=`올인 ${fmt(p.stack)}칩`;if(!p.busted)drawBetEditor();}
}
let toastTimer=null;function toast(message){const el=$('reactionToast');el.textContent=message;el.classList.remove('hidden');void el.offsetWidth;el.classList.add('float');clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.classList.add('hidden');el.classList.remove('float');},2400);}
function chat(text){if(!CHATS.includes(text)||!view)return;const now=Date.now();if(now-lastChatSent<1200){toast('잠깐만요! 채팅은 1초 간격으로 보내주세요.');return;}lastChatSent=now;if(host)broadcastChat(nickname,text);else if(connection?.open){toast(`${nickname}: ${text}`);send(connection,{kind:'chat',text});}}
$('createBtn').onclick=hostRoom;$('joinBtn').onclick=()=>joinRoom($('roomInput').value);$('roomInput').onkeyup=e=>{if(e.key==='Enter')joinRoom($('roomInput').value)};
$('startBtn').onclick=()=>{if(!host)return;try{C.startHand(match);publish();}catch(e){toast(e.message)}};
$('copyCodeBtn').onclick=async()=>{try{await navigator.clipboard.writeText(room);toast('방 코드 복사 완료!')}catch(_){toast('방 코드: '+room)}};
$('shareBtn').onclick=async()=>{const u=new URL(location.href);u.searchParams.set('room',room);if(navigator.share){try{await navigator.share({title:'말랑포커 같이 하자',text:`방 코드 ${room}`,url:u.toString()})}catch(_){}}else{try{await navigator.clipboard.writeText(u.toString());toast('초대 링크 복사 완료!')}catch(_){toast(u.toString())}}};
$('leaveWaitBtn').onclick=leave;$('leaveGameBtn').onclick=()=>{if(confirm('게임에서 나갈까요? 현재 진행 중인 게임이 중단될 수 있어요.'))leave();};
$('foldBtn').onclick=()=>perform('fold');$('checkCallBtn').onclick=()=>perform(view?.legal?.toCall?'call':'check');$('raiseBtn').onclick=()=>perform('raise');$('allInBtn').onclick=()=>perform('allin');$('nextHandBtn').onclick=ready;
$('raiseAmount').oninput=e=>{const n=Number(e.target.value);if(Number.isFinite(n)){$('raiseDisplay').textContent=fmt(n)+'칩';$('raiseRange').value=Math.max(Number($('raiseRange').min),Math.min(Number($('raiseRange').max),n));betValue=n;$('raiseBtn').textContent=`${view?.currentBet?'레이즈':'베팅'} ${fmt(n)}칩`;}};
$('raiseAmount').onchange=e=>setBet(Number(e.target.value));$('raiseRange').oninput=e=>setBet(Number(e.target.value));
$('minusBet').onclick=()=>setBet(betValue-20);$('plusBet').onclick=()=>setBet(betValue+20);
document.querySelectorAll('[data-chat]').forEach(el=>el.onclick=()=>chat(el.dataset.chat));
const dlg=$('rulesDialog');$('rulesBtn').onclick=()=>dlg.showModal();$('closeRulesBtn').onclick=()=>dlg.close();$('okayRulesBtn').onclick=()=>dlg.close();
const initialRoom=new URL(location.href).searchParams.get('room');if(initialRoom&&/^[A-Za-z0-9]{6}$/.test(initialRoom)){$('roomInput').value=initialRoom.toUpperCase();lobbyStatus('초대 코드가 입력됐어요. 참가를 눌러주세요!');}
if('serviceWorker'in navigator&&/^https?:$/.test(location.protocol))window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js?v=2.1').catch(()=>{}));
})();
