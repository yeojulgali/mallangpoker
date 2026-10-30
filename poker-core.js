/* Mallang Poker game engine - two-player no-money Texas Hold'em. */
(function(root, factory) {
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  root.PokerCore = value;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const SUITS = ['♠', '♥', '♦', '♣'];
  const BLIND_SMALL = 10;
  const BLIND_BIG = 20;
  const STARTING_CHIPS = 1000;
  const RAISE_STEP = 20;
  const STAGES = ['preflop','flop','turn','river'];
  const RANK_LABELS = ['하이 카드', '원페어', '투페어', '트리플', '스트레이트', '플러시', '풀하우스', '포카드', '스트레이트 플러시'];
  const randomNumber = max => {
    if (globalThis.crypto && globalThis.crypto.getRandomValues) {
      const maxAcceptable = Math.floor(4294967296 / max) * max;
      const arr = new Uint32Array(1);
      do { globalThis.crypto.getRandomValues(arr); } while (arr[0] >= maxAcceptable);
      return arr[0] % max;
    }
    return Math.floor(Math.random() * max);
  };
  function createDeck() {
    const deck = [];
    for (const suit of SUITS) for (let value=2;value<=14;value++) deck.push({suit, value});
    for(let i=deck.length-1;i>0;i--) {
      const j=randomNumber(i+1);
      [deck[i],deck[j]]=[deck[j],deck[i]];
    }
    return deck;
  }
  function straightHigh(values) {
    const unique = [...new Set(values)].sort((a,b)=>b-a);
    if (unique.includes(14)) unique.push(1);
    let count=1;
    for(let i=1;i<unique.length;i++) {
      if(unique[i-1]-unique[i]===1) {count++;if(count>=5) return unique[i-4];}
      else count=1;
    }
    return 0;
  }
  function evaluateFive(cards) {
    const values=cards.map(c=>c.value).sort((a,b)=>b-a);
    const flush=cards.every(c=>c.suit===cards[0].suit);
    const straight=straightHigh(values);
    const counts = new Map();
    for (const val of values) counts.set(val,(counts.get(val)||0)+1);
    const groups=[...counts.entries()].sort((a,b)=>b[1]-a[1] || b[0]-a[0]);
    if (flush && straight) return [8,straight];
    if (groups[0][1]===4) return [7,groups[0][0],groups[1][0]];
    if (groups[0][1]===3 && groups[1][1]===2) return [6,groups[0][0],groups[1][0]];
    if (flush) return [5,...values];
    if (straight) return [4,straight];
    if (groups[0][1]===3) return [3,groups[0][0],...groups.slice(1).map(g=>g[0]).sort((a,b)=>b-a)];
    if (groups[0][1]===2 && groups[1][1]===2) {
      const pairs=[groups[0][0],groups[1][0]].sort((a,b)=>b-a);
      return [2,...pairs,groups[2][0]];
    }
    if (groups[0][1]===2) return [1,groups[0][0],...groups.slice(1).map(g=>g[0]).sort((a,b)=>b-a)];
    return [0,...values];
  }
  function compareRanks(a,b) {
    for (let i=0;i<Math.max(a.length,b.length);i++) {
      if ((a[i]||0)!==(b[i]||0)) return (a[i]||0) > (b[i]||0) ? 1 : -1;
    }
    return 0;
  }
  function evaluate(cards) {
    if (!Array.isArray(cards)||cards.length<5) throw new Error('5장 이상의 카드가 필요해요.');
    let best=null;
    for(let a=0;a<cards.length-4;a++) for(let b=a+1;b<cards.length-3;b++)
      for(let c=b+1;c<cards.length-2;c++) for(let d=c+1;d<cards.length-1;d++)
        for(let e=d+1;e<cards.length;e++) {
          const rank=evaluateFive([cards[a],cards[b],cards[c],cards[d],cards[e]]);
          if(!best||compareRanks(rank,best)>0) best=rank;
        }
    return best;
  }
  function createMatch(names=['방장','손님']) {
    return {
      players:[0,1].map(i=>({name:String(names[i]||['방장','손님'][i]).slice(0,12),stack:STARTING_CHIPS,street:0,total:0,cards:[],folded:false})),
      dealer:1, handNo:0, stage:'waiting', deck:[], board:[], pot:0, currentBet:0,
      turn:null, acted:[false,false], result:null, note:'', lastAction:''
    };
  }
  function take(state, idx, amount) {
    const p=state.players[idx];
    const charged=Math.min(p.stack,Math.max(0,amount));
    p.stack-=charged;p.street+=charged;p.total+=charged;state.pot+=charged;
    return charged;
  }
  function draw(s,n=1) { for(let i=0;i<n;i++) s.board.push(s.deck.pop()); }
  function newHand(s) {
    if(s.stage!=='waiting'&&s.stage!=='showdown') throw new Error('현재 판이 끝나야 새 판을 시작할 수 있어요.');
    if(s.players.some(p=>p.stack===0)) {
      s.players.forEach(p=>p.stack=STARTING_CHIPS);
      s.note='칩이 모두 소진되어 1,000칩으로 다시 시작해요.';
    } else s.note='';
    s.handNo++;s.dealer=1-s.dealer;
    s.deck=createDeck();s.board=[];s.pot=0;s.currentBet=0;s.acted=[false,false];s.result=null;
    s.players.forEach(p=>{p.cards=[s.deck.pop(),s.deck.pop()];p.street=0;p.total=0;p.folded=false;});
    take(s,s.dealer,BLIND_SMALL);
    take(s,1-s.dealer,BLIND_BIG);
    s.currentBet=Math.max(...s.players.map(p=>p.street));
    s.stage='preflop';s.turn=s.dealer;
    s.lastAction='새 판 시작! 스몰 블라인드 10 / 빅 블라인드 20';
    if(s.players.some(p=>p.stack===0)) afterAction(s);
    return s;
  }
  function refundUncalled(s) {
    const [a,b]=s.players;
    if(a.total===b.total) return;
    const high=a.total>b.total?0:1;
    const amount=Math.abs(a.total-b.total);
    const p=s.players[high];p.stack+=amount;p.total-=amount;
    p.street=Math.max(0,p.street-amount);
    s.pot-=amount;
  }
  function settle(s, foldedWinner) {
    refundUncalled(s);
    const ranks=foldedWinner===undefined?s.players.map(p=>evaluate([...p.cards,...s.board])):null;
    const winner=foldedWinner!==undefined?foldedWinner:compareRanks(ranks[0],ranks[1])>0?0:compareRanks(ranks[0],ranks[1])<0?1:null;
    if(winner===null){
      const half=Math.floor(s.pot/2);
      s.players[0].stack+=half;s.players[1].stack+=half;
      // Odd chip goes to non-dealer, the first postflop player.
      s.players[1-s.dealer].stack+=s.pot%2;
    } else s.players[winner].stack+=s.pot;
    const payout=s.pot;
    s.result={winner, type:foldedWinner===undefined?'showdown':'fold', payout,
      ranks:ranks?ranks.map(r=>RANK_LABELS[r[0]]):null,
      text:winner===null?`무승부! ${Math.floor(payout/2)}칩씩 나눴어요.`:
        `${s.players[winner].name} 승리! +${payout}칩`};
    s.lastAction=s.result.text;s.turn=null;s.stage='showdown';
    return s;
  }
  function nextStreet(s) {
    const idx=STAGES.indexOf(s.stage);
    if(idx===-1) return;
    if(idx===3) return settle(s);
    s.stage=STAGES[idx+1];
    draw(s,idx===0?3:1);
    s.players.forEach(p=>p.street=0);
    s.currentBet=0;s.acted=[false,false];s.turn=1-s.dealer;
    s.lastAction=({flop:'플롭 카드 3장 공개',turn:'턴 카드 공개',river:'리버 카드 공개'})[s.stage];
  }
  function runout(s) {
    while(s.stage!=='river'&&s.stage!=='showdown') nextStreet(s);
    if(s.stage==='river') settle(s);
  }
  function afterAction(s) {
    if(!STAGES.includes(s.stage)) return;
    const allin=s.players.findIndex(p=>p.stack===0);
    if(allin!==-1) {
      const other=1-allin;
      if(s.players[other].street >= s.players[allin].street || s.players[other].stack===0) {
        runout(s);return;
      }
      s.turn=other;return;
    }
    if(s.players[0].street===s.players[1].street&&s.acted.every(Boolean)) {
      nextStreet(s);
      return;
    }
    if(s.turn!==null) s.turn=1-s.turn;
  }
  function legalActions(s,idx) {
    const isTurn=s.turn===idx&&STAGES.includes(s.stage);
    const p=s.players[idx],opp=s.players[1-idx];
    const toCall=Math.max(0,s.currentBet-p.street);
    const maxTarget=Math.min(p.street+p.stack,opp.street+opp.stack);
    const target=s.currentBet===0?BLIND_BIG:s.currentBet+RAISE_STEP;
    return {isTurn,toCall,canCheck:isTurn&&toCall===0,canCall:isTurn&&toCall>0,
      canFold:isTurn,canRaise:isTurn&&target<=maxTarget&&target>s.currentBet,
      canAllIn:isTurn&&maxTarget>p.street&&maxTarget>s.currentBet,
      raiseTo:target, maxTarget, callAmount:Math.min(toCall,p.stack)};
  }
  function action(s,idx,type) {
    if(![0,1].includes(idx)) throw new Error('플레이어가 올바르지 않아요.');
    const legal=legalActions(s,idx),p=s.players[idx],op=s.players[1-idx];
    if(!legal.isTurn) throw new Error('아직 내 차례가 아니에요.');
    if(type==='fold') {p.folded=true;s.lastAction=`${p.name}님이 폴드했어요.`;return settle(s,1-idx);}
    if(type==='check') {
      if(!legal.canCheck) throw new Error('먼저 콜하거나 폴드해야 해요.');
      s.acted[idx]=true;s.lastAction=`${p.name} 체크`;
    } else if(type==='call') {
      if(!legal.canCall) throw new Error('콜할 베팅이 없어요.');
      const paid=take(s,idx,legal.toCall);
      s.acted[idx]=true;s.lastAction=`${p.name} 콜 ${paid}칩`;
    } else if(type==='raise'||type==='allin') {
      if(type==='raise'&&!legal.canRaise) throw new Error('레이즈할 칩이 부족해요.');
      if(type==='allin'&&!legal.canAllIn) throw new Error('최대 베팅을 할 수 없어요.');
      const target=type==='raise'?legal.raiseTo:legal.maxTarget;
      const paid=take(s,idx,target-p.street);
      if(p.street>s.currentBet) {
        s.currentBet=p.street;
        s.acted[1-idx]=false;
      }
      s.acted[idx]=true;s.lastAction=`${p.name} ${type==='raise'?'레이즈':'최대 베팅'} ${paid}칩`;
    } else throw new Error('지원하지 않는 행동이에요.');
    afterAction(s);
    return s;
  }
  function publicView(s,idx) {
    const reveal=s.stage==='showdown'&&s.result&&s.result.type==='showdown';
    return {handNo:s.handNo,dealer:s.dealer,stage:s.stage,board:s.board,pot:s.pot,
      turn:s.turn,currentBet:s.currentBet,note:s.note,lastAction:s.lastAction,
      players:s.players.map((p,i)=>({name:p.name,stack:p.stack,street:p.street,folded:p.folded,
        cards:i===idx||reveal?p.cards:null})),
      result:s.result, legal:legalActions(s,idx), you:idx};
  }
  return {createMatch,newHand,action,publicView,legalActions,evaluate,evaluateFive,compareRanks,straightHigh,createDeck,STARTING_CHIPS};
});
