import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, get, onValue, update, remove, onDisconnect, push, onChildAdded } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyA4dDkYxWzJ60MHGHi_c9ORZipr-w_pRzs",
    authDomain: "bizharbingo.firebaseapp.com",
    databaseURL: "https://bizharbingo-default-rtdb.firebaseio.com",
    projectId: "bizharbingo",
    storageBucket: "bizharbingo.firebasestorage.app",
    messagingSenderId: "945947568512",
    appId: "1:945947568512:web:289ea6660f0ba03c6af965"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- گۆڕاوێن گشتی ---
window.gameMode = null;
window.maxGameNumbers = 99; 
window.requiredNumbers = 3;
window.players = {}; 
window.drawnNumbers = [];
window.autoInterval = null; window.isAutoPlaying = false;
window.audioCtx = null;
window.celebrationTimeout = null; window.pendingAlertTimeout = null; window.pendingModalTimeout = null;
window.soundMode = 2; window.selectedLang = 'en';
window.currentTheme = 'classic';
window.alertsEnabled = { draw: true, win: true, lose: true };
window.touchstartX = 0; window.touchstartY = 0;

// --- گۆڕاوێن ئۆنلاین و ئۆفللاین ---
window.roomCode = null; window.isHost = false;
window.hasJoined = false;
window.playerId = "player_" + Math.random().toString(36).substr(2, 9);
window.myPlayerName = "یاریزان";
window.currentEditIdOffline = null;

// --- گۆڕاوێن تایبەت ب چاتا دەنگی (Agora) ---
window.agoraAppId = "3a993f3595994020b47f876125a14471";
window.agoraClient = null;
window.localAudioTrack = null;
window.isMicMuted = true;
window.remoteUsers = {};
window.mutedPlayers = {};
window.isAllMuted = false;

// --- دروستکرنا ئەنیمەیشنا تۆپێن بینگۆیێ بۆ باگگراوەندێ ---
window.createFloatingBalls = function() {
    const container = document.getElementById('floatingBg');
    if(!container) return;
    container.innerHTML = '';
    const colors = ['#00bfff', '#dc143c', '#a9a9a9', '#32cd32', '#ffd700', '#ff69b4', '#8a2be2'];
    for(let i = 0; i < 20; i++) {
        const ball = document.createElement('div');
        ball.className = 'bingo-ball-anim';
        const size = Math.floor(Math.random() * 50) + 40; 
        ball.style.width = size + 'px';
        ball.style.height = size + 'px';
        ball.style.left = Math.floor(Math.random() * 95) + 'vw';
        ball.style.animationDuration = (Math.random() * 10 + 12) + 's'; 
        ball.style.animationDelay = (Math.random() * 10) + 's';
        const color = colors[Math.floor(Math.random() * colors.length)];
        ball.style.background = `radial-gradient(circle at 30% 30%, #ffffff, ${color})`;
        ball.style.border = `2px solid ${color}`;
        ball.style.color = '#333';
        ball.style.fontSize = (size / 2.5) + 'px';
        
        ball.innerText = Math.floor(Math.random() * 99) + 1;
        container.appendChild(ball);
    }
}

// --- دەستپێک (Init) ---
window.onload = function() {
    window.loadGlobalSettings();
    window.applyTheme();
    window.createFloatingBalls(); 
    
    // 🟢 تۆمارکرنا Service Worker بۆ یارییا ئۆفللاین
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').then(() => {
            console.log("Service Worker هاتە تۆمارکرن");
        }).catch(err => console.log("خەلەتی د تۆمارکرنا SW دا", err));
    }
    
    if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.getVoices(); };
    }
    
    let savedSession = sessionStorage.getItem('bingoOnlineSession');
    if (savedSession) {
        let session = JSON.parse(savedSession);
        window.roomCode = session.roomCode;
        window.playerId = session.playerId;
        window.myPlayerName = session.myPlayerName;
        document.getElementById('btnRejoin').style.display = 'flex';
    }
    
    document.getElementById('modeSelectionScreen').style.display = 'block';
};

window.selectMode = function(mode) {
    window.gameMode = mode;
    document.getElementById('modeSelectionScreen').style.display = 'none';
    if (mode === 'offline') {
        document.getElementById('floatingBg').style.display = 'none';
        document.getElementById('gameContainer').style.display = 'block';
        document.getElementById('hostGameControls').style.display = 'grid'; 
        document.getElementById('btnLeaveRoom').style.display = 'none';
        document.getElementById('addPlayerMenuBtn').style.display = 'block';
        document.getElementById('settingMaxNumRow').style.display = 'flex';
        document.getElementById('waitResetMessage').style.display = 'none';
        document.getElementById('onlineFloatingControls').style.display = 'none';
        document.getElementById('btnResetLocal').style.display = 'block'; 
        
        window.loadOfflineGameState();
        window.initBoard();
        window.updateOfflineMenuState();
    } else {
        document.getElementById('lobbyScreen').style.display = 'block';
        document.getElementById('addPlayerMenuBtn').style.display = 'none';
        document.getElementById('settingMaxNumRow').style.display = 'none';
        document.getElementById('btnLeaveRoom').style.display = 'block';
        document.getElementById('btnResetLocal').style.display = 'none';
    }
};

function setBtnLoading(btnId, isLoading, originalText) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if(isLoading) {
        btn.disabled = true;
        btn.innerHTML = `<div class="spinner"></div> چاڤەڕێ بە...`;
    } else {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

window.createRoom = async function() {
    setBtnLoading('btnCreateRoom', true, '👑 دروستکرنا ژوورێ (Host)');
    try {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        window.roomCode = '';
        for (let i = 0; i < 4; i++) window.roomCode += chars.charAt(Math.floor(Math.random() * chars.length));
        window.isHost = true;
        window.saveOnlineSession();
        const roomRef = ref(db, 'rooms/' + window.roomCode);
        await set(roomRef, { status: 'waiting', hostId: window.playerId, maxNumbers: 99, requiredNumbers: 3, drawnNumbers: [], players: {} });
        onDisconnect(roomRef).remove();
        
        await window.joinAgoraChannel();
        window.setupRoomListener();
        window.showWaitingScreen();
    } catch(e) {
        alert("خەلەتیەک چێبوو د دروستکرنا ژوورێ دا، تکایە ئینتەرنێتا خۆ کۆنترۆل بکە.");
    }
    setBtnLoading('btnCreateRoom', false, '👑 دروستکرنا ژوورێ (Host)');
};

window.joinRoom = async function() {
    setBtnLoading('btnJoinRoom', true, 'چوونە ژوورێ (Join)');
    try {
        const inputCode = document.getElementById('joinRoomInput').value.trim().toUpperCase();
        if (inputCode.length !== 4) { alert("کۆدێ دروست یێ ٤ پیتی بنڤیسە!"); setBtnLoading('btnJoinRoom', false, 'چوونە ژوورێ (Join)'); return; }
        const snapshot = await get(ref(db, 'rooms/' + inputCode));
        if (!snapshot.exists()) { alert("ئەڤ ژوورە نینە!"); setBtnLoading('btnJoinRoom', false, 'چوونە ژوورێ (Join)'); return; }
        
        window.roomCode = inputCode;
        window.isHost = false; window.hasJoined = false;
        window.saveOnlineSession();
        onDisconnect(ref(db, `rooms/${window.roomCode}/players/${window.playerId}`)).remove();
        
        await window.joinAgoraChannel();
        window.setupRoomListener();
        window.showWaitingScreen();
    } catch(e) {
        alert("خەلەتیەک چێبوو!");
    }
    setBtnLoading('btnJoinRoom', false, 'چوونە ژوورێ (Join)');
};

window.rejoinOnlineRoom = async function() {
    setBtnLoading('btnRejoin', true, '🔄 ڤەگەڕیان بۆ ژوورا بەرێ');
    try {
        const snapshot = await get(ref(db, 'rooms/' + window.roomCode));
        if (!snapshot.exists()) { 
            alert("ژوور هاتییە گرتن یان نەمايە!");
            sessionStorage.removeItem('bingoOnlineSession');
            window.location.reload();
            return; 
        }
        window.gameMode = 'online';
        document.getElementById('modeSelectionScreen').style.display = 'none';
        document.getElementById('addPlayerMenuBtn').style.display = 'none';
        document.getElementById('settingMaxNumRow').style.display = 'none';
        document.getElementById('btnLeaveRoom').style.display = 'block';
        document.getElementById('btnResetLocal').style.display = 'none'; 
        
        const data = snapshot.val();
        if (data.hostId === window.playerId) { 
            window.isHost = true; onDisconnect(ref(db, 'rooms/' + window.roomCode)).remove();
        } else { 
            window.isHost = false;
            onDisconnect(ref(db, `rooms/${window.roomCode}/players/${window.playerId}`)).remove(); 
        }
        
        if (data.players && data.players[window.playerId] && data.players[window.playerId].isReady) {
            window.hasJoined = true;
        }
        
        await window.joinAgoraChannel();
        window.setupRoomListener();
        window.showWaitingScreen();
    } catch(e) {}
    setBtnLoading('btnRejoin', false, '🔄 ڤەگەڕیان بۆ ژوورا بەرێ');
};

window.leaveRoom = async function() {
    if(window.roomCode && window.gameMode === 'online') {
        if(window.isHost) await remove(ref(db, 'rooms/' + window.roomCode));
        else await remove(ref(db, `rooms/${window.roomCode}/players/${window.playerId}`));
    }
    await window.leaveAgoraChannel();
    sessionStorage.removeItem('bingoOnlineSession');
    window.location.reload();
}

window.saveOnlineSession = function() {
    sessionStorage.setItem('bingoOnlineSession', JSON.stringify({ roomCode: window.roomCode, playerId: window.playerId, myPlayerName: window.myPlayerName }));
}

window.copyRoomCode = function() {
    if(window.roomCode) {
        navigator.clipboard.writeText(window.roomCode).then(() => {
            alert("کۆدێ ژوورێ هاتە کۆپیکرن: " + window.roomCode);
        });
    }
}

window.showWaitingScreen = function() {
    document.getElementById('lobbyScreen').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'none';
    document.getElementById('waitingScreen').style.display = 'block'; 
    document.getElementById('displayRoomCode').innerText = window.roomCode;
    document.getElementById('onlineFloatingControls').style.display = 'flex'; 
    window.setupChatAndReactions(); 
    
    if (window.isHost) { 
        document.getElementById('hostSettingsSection').style.display = 'block';
        document.getElementById('speedSettingRow').style.display = 'flex'; 
    }
}

window.renderOnlineInputs = function(count) {
    const container = document.getElementById('onlineNumberInputs');
    container.innerHTML = '';
    for(let i = 0; i < count; i++) {
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.className = 'num-input-box';
        container.appendChild(inp);
    }
    document.getElementById('btnAddOnlineNumber').style.display = 'none';
    document.getElementById('onlineNumberTitle').innerText = `پێدڤییە ${count} ژمارەیان هەلبژێری:`;
}

window.updateHostSettings = function() {
    if(!window.isHost) return;
    let val = parseInt(document.getElementById('hostMaxNumInput').value); 
    if(isNaN(val) || val < 10) val = 10;
    let reqNum = parseInt(document.getElementById('hostReqNumInput').value) || 3;
    update(ref(db, 'rooms/' + window.roomCode), { maxNumbers: val, requiredNumbers: reqNum });
}

window.kickPlayer = async function(id) {
    if(!window.isHost) return;
    if(confirm("دڤێت ڤی یاریزانی دەرکەی ژ یاریێ؟")) {
        await remove(ref(db, `rooms/${window.roomCode}/players/${id}`));
    }
}

window.setPlayerReady = async function() {
    const name = document.getElementById('setupPlayerName').value.trim();
    const inputs = document.querySelectorAll('#onlineNumberInputs .num-input-box');
    let numbers = []; 
    inputs.forEach(inp => { 
        let val = parseInt(inp.value); 
        if (!isNaN(val) && val >= 1 && val <= window.maxGameNumbers) numbers.push(val); 
    });
    if(!name || numbers.length === 0) { alert(`ناڤێ خۆ بنڤیسە!`); return; }
    if(numbers.length !== window.requiredNumbers) { 
        alert(`تکایە هەمی خانەیان تژی بکە! پێدڤییە ${window.requiredNumbers} ژمارەیان بنڤیسی.`); return; 
    }
    if ([...new Set(numbers)].length !== numbers.length) { alert('ژمارە دووبارە کرینە!'); return; }

    let allUsed = [];
    Object.values(window.players).forEach(p => { if(p.id !== window.playerId) allUsed = allUsed.concat(p.numbers || []); });
    let dup = numbers.find(n => allUsed.includes(n));
    if (dup !== undefined) { 
        alert(`لێبۆڕینێ دخوازم، ژمارە (${dup}) پێشتر ژ لایێ کەسەکێ دی ڤە هاتییە هەلبژارتن!\nهیڤییە ژمارەیەکا دی بنڤیسە.`); return; 
    }

    window.myPlayerName = name; 
    window.hasJoined = true;
    window.saveOnlineSession();
    document.getElementById('btnReady').innerText = "چاڤەڕێ بە..."; document.getElementById('btnReady').disabled = true;
    document.getElementById('setupPlayerName').disabled = true; inputs.forEach(i => i.disabled = true);
    await set(ref(db, `rooms/${window.roomCode}/players/${window.playerId}`), { id: window.playerId, name: name, numbers: numbers, isSafe: false, isLoser: false, isReady: true });
}

window.startGameHost = async function() {
    if(!window.isHost) return;
    const pArr = Object.values(window.players);
    if(pArr.length < 2) { alert("ب لایەنی ڤە پێدڤییە ٢ یاریزان بهێنە تۆمارکرن بۆ دەستپێکرنا یاریێ!"); return; }
    if(pArr.filter(p => !p.isReady).length > 0) { alert("هێشتا هەمیان ئامادەیی نیشان نەدایە!"); return; }
    await update(ref(db, 'rooms/' + window.roomCode), { status: 'playing' });
}

window.setupRoomListener = function() {
    onValue(ref(db, 'rooms/' + window.roomCode), (snapshot) => {
        const data = snapshot.val();
        if (!data) { 
            alert("ژوور هاتە گرتن!"); 
            window.leaveAgoraChannel(); // 🟢 بەشێ مایکرۆفۆنی دێ هێتە گرتن
            sessionStorage.removeItem('bingoOnlineSession'); 
            window.location.reload(); 
            return; 
        }
        
        window.maxGameNumbers = data.maxNumbers || 99; 
        window.players = data.players || {};
        
        if (window.hasJoined && !window.players[window.playerId]) {
            alert("تو هاتە دەرکرن ژ لایێ خودانێ ژوورێ ڤە!");
            window.leaveRoom();
            return;
        }

        // 🟢 کۆنترۆلا بێدەنگکرنا یاریزانێن نوی ئەگەر Mute All چالاک بیت
        if (window.isAllMuted) {
            Object.values(window.players).forEach(p => {
                if (p.id !== window.playerId && window.mutedPlayers[p.id] !== true) {
                    window.mutedPlayers[p.id] = true;
                    if (window.remoteUsers[p.id] && window.remoteUsers[p.id].audioTrack) {
                        window.remoteUsers[p.id].audioTrack.stop();
                    }
                }
            });
        }

        let newReqNum = data.requiredNumbers || 3;
        if(window.requiredNumbers !== newReqNum) {
            window.requiredNumbers = newReqNum;
            if(document.getElementById('waitingScreen').style.display !== 'none' && !window.hasJoined) {
                window.renderOnlineInputs(window.requiredNumbers);
            } else if (window.hasJoined && document.getElementById('waitingScreen').style.display !== 'none') {
                let myPlayerData = window.players[window.playerId];
                if(myPlayerData && myPlayerData.numbers && myPlayerData.numbers.length !== window.requiredNumbers) {
                    alert("خودانێ ژوورێ شێوازێ یاریێ گهۆڕی، پێدڤییە دوبارە ژمارەیان بنڤیسی!");
                    window.hasJoined = false;
                    document.getElementById('btnReady').innerText = "ئامادەمە (Ready)";
                    document.getElementById('btnReady').disabled = false;
                    document.getElementById('setupPlayerName').disabled = false;
                    window.renderOnlineInputs(window.requiredNumbers);
                    update(ref(db, `rooms/${window.roomCode}/players/${window.playerId}`), {isReady: false, numbers: []});
                }
            }
        } else if(document.getElementById('waitingScreen').style.display !== 'none' && !window.hasJoined && document.getElementById('onlineNumberInputs').children.length === 0) {
            window.renderOnlineInputs(window.requiredNumbers);
        }
        
        window.updateWaitingRoomUI();
        window.renderPlayersTable();

        if (data.status === 'playing') {
            if(document.getElementById('waitingScreen').style.display !== 'none') window.switchToGameScreen();
        } else if (data.status === 'waiting' && document.getElementById('gameContainer').style.display !== 'none') {
            window.resetLocalGameUI();
        }

        const newDrawn = data.drawnNumbers || [];
        if (newDrawn.length > window.drawnNumbers.length) {
            newDrawn.slice(window.drawnNumbers.length).forEach(n => window.processDrawUI(n, true));
        } else if (newDrawn.length === 0 && window.drawnNumbers.length > 0) {
            window.drawnNumbers = [];
            window.resetLocalGameUI();
        }
    });
}

window.updateWaitingRoomUI = function() {
    const list = document.getElementById('waitingPlayersList');
    list.innerHTML = '';
    const pArr = Object.values(window.players);
    pArr.forEach(p => { 
        const li = document.createElement('li'); 
        li.style.display = 'flex'; li.style.justifyContent = 'space-between'; li.style.alignItems = 'center'; li.style.marginBottom = '6px'; li.style.background = '#f9f9f9'; li.style.padding = '5px 10px'; li.style.borderRadius = '6px'; li.style.border = '1px solid #ddd';
        
        let kickBtnHtml = (window.isHost && p.id !== window.playerId) ? `<button style="background:#f44336; color:white; border:none; border-radius:4px; padding:4px 8px; cursor:pointer; font-weight:bold; font-size:12px;" onclick="kickPlayer('${p.id}')">❌ دەرکرن</button>` : '';
        
        li.innerHTML = `<span>${p.name} ${p.isReady ? '✅' : '⏳'}</span> ${kickBtnHtml}`; 
        list.appendChild(li); 
    });
    if (window.isHost) document.getElementById('btnStartGame').disabled = !(pArr.length >= 2 && pArr.every(p => p.isReady));
}

window.switchToGameScreen = function() {
    document.getElementById('floatingBg').style.display = 'none';
    document.getElementById('waitingScreen').style.display = 'none'; document.getElementById('gameContainer').style.display = 'block';
    window.initBoard(); window.updateRemainingCount();
    if (window.isHost) { document.getElementById('hostGameControls').style.display = 'grid'; document.getElementById('btnResetGameHost').style.display = 'block'; } 
    else { document.getElementById('playerWaitMessage').style.display = 'block'; document.getElementById('waitResetMessage').style.display = 'block'; }
}

let chatListenerSetup = false;
window.setupChatAndReactions = function() {
    if(chatListenerSetup) return;
    chatListenerSetup = true;
    const chatRef = ref(db, 'rooms/' + window.roomCode + '/chat');
    onChildAdded(chatRef, (snapshot) => {
        const msg = snapshot.val();
        const chatBox = document.getElementById('chatMessages');
        const isMine = msg.senderId === window.playerId;
        
        const wrapper = document.createElement('div'); wrapper.className = 'chat-msg-wrapper';
        const msgDiv = document.createElement('div'); msgDiv.className = `chat-msg ${isMine ? 'mine' : 'others'}`;
        msgDiv.innerHTML = `<div class="chat-sender">${isMine ? 'ئەز' : msg.sender}</div>${msg.text}`;
        
        wrapper.appendChild(msgDiv); chatBox.appendChild(wrapper);
        chatBox.scrollTop = chatBox.scrollHeight;
    });
    const reactionRef = ref(db, 'rooms/' + window.roomCode + '/reactions');
    onChildAdded(reactionRef, (snapshot) => {
        const reaction = snapshot.val();
        window.showFloatingEmoji(reaction.emoji);
    });
}

window.toggleChat = function() {
    const chat = document.getElementById('chatOverlay');
    chat.style.display = chat.style.display === 'none' ? 'flex' : 'none';
}

window.sendChatMessage = async function() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if(!text) return; input.value = '';
    await push(ref(db, 'rooms/' + window.roomCode + '/chat'), { senderId: window.playerId, sender: window.myPlayerName || "یاریزان", text: text, time: Date.now() });
}

window.sendReaction = async function(emoji) {
    await push(ref(db, 'rooms/' + window.roomCode + '/reactions'), { senderId: window.playerId, emoji: emoji, time: Date.now() });
}

window.showFloatingEmoji = function(emojiText) {
    const emoji = document.createElement('div');
    emoji.className = 'floating-emoji'; emoji.innerText = emojiText;
    emoji.style.left = (Math.random() * 80 + 10) + '%'; 
    document.body.appendChild(emoji);
    setTimeout(() => { emoji.remove(); }, 2000);
}

window.loadOfflineGameState = function() {
    const savedMax = localStorage.getItem('bingoOfflineMaxNum');
    if (savedMax) { window.maxGameNumbers = parseInt(savedMax); document.getElementById('offlineMaxNumInput').value = window.maxGameNumbers; }
    const savedPlayers = localStorage.getItem('bingoOfflinePlayers');
    if (savedPlayers) window.players = JSON.parse(savedPlayers);
    const savedDrawn = localStorage.getItem('bingoOfflineDrawn'); if (savedDrawn) window.drawnNumbers = JSON.parse(savedDrawn);
    window.renderPlayersTable();
    if (window.drawnNumbers.length > 0) {
        setTimeout(() => { window.drawnNumbers.forEach(n => { const cell = document.getElementById('cell-' + n); if (cell) cell.classList.add('drawn'); }); }, 100);
        const last = window.drawnNumbers[window.drawnNumbers.length - 1]; document.getElementById('drawnNumberDisplay').innerText = last < 10 ? '0' + last : last;
    }
}

window.saveOfflineGameState = function() {
    localStorage.setItem('bingoOfflinePlayers', JSON.stringify(window.players));
    localStorage.setItem('bingoOfflineDrawn', JSON.stringify(window.drawnNumbers));
    localStorage.setItem('bingoOfflineMaxNum', window.maxGameNumbers.toString());
    window.updateOfflineMenuState();
}

window.changeMaxNumberOffline = function() {
    if (window.drawnNumbers.length > 0 || Object.keys(window.players).length > 0) {
        alert("نەشێی ژمارێ بگهۆڕی دەمێ یاریزان هەی یان یاری دەستپێکری!");
        document.getElementById('offlineMaxNumInput').value = window.maxGameNumbers; return;
    }
    let newVal = parseInt(document.getElementById('offlineMaxNumInput').value);
    if(isNaN(newVal) || newVal < 10) newVal = 10;
    window.maxGameNumbers = newVal; document.getElementById('offlineMaxNumInput').value = window.maxGameNumbers; window.saveOfflineGameState(); window.initBoard(); window.updateRemainingCount();
}

window.addPlayerOffline = function() {
    if (window.drawnNumbers.length > 0) return;
    const name = document.getElementById('offlinePlayerName').value.trim();
    const inputs = document.querySelectorAll('#offlineNumberInputs .num-input-box');
    let numbers = [];
    inputs.forEach(inp => { let val = parseInt(inp.value); if (!isNaN(val) && val >= 1 && val <= window.maxGameNumbers) numbers.push(val); });
    if(!name || numbers.length === 0) { alert(`ناڤێ یاریزانی و ژمارەیەکێ بنڤیسە!`); return; }
    if ([...new Set(numbers)].length !== numbers.length) { alert('تە ژمارەیەک دوو جاران یا نڤیسی. هیڤییە ژمارەیێن دووبارە ڕابکە!'); return; }

    let allUsed = [];
    Object.values(window.players).forEach(p => { 
        if(p.id !== window.currentEditIdOffline) allUsed = allUsed.concat(p.numbers || []); 
    });
    let dup = numbers.find(n => allUsed.includes(n)); 
    if (dup !== undefined) { alert(`لێبۆڕینێ دخوازم، ژمارە (${dup}) پێشتر ژ لایێ کەسەکێ دی ڤە هاتییە هەلبژارتن!\nهیڤییە ژمارەیەکا دی بنڤیسە.`); return; }

    const id = window.currentEditIdOffline || Date.now().toString();
    window.players[id] = { id: id, name: name, numbers: numbers, isSafe: false, isLoser: false };
    
    window.currentEditIdOffline = null;
    document.getElementById('btnAddPlayerOffline').innerText = 'Change (زێدەبکە)';
    document.getElementById('offlinePlayerName').value = ''; 
    document.getElementById('offlineNumberInputs').innerHTML = '<input type="number" class="num-input-box"><input type="number" class="num-input-box"><input type="number" class="num-input-box">';
    
    window.saveOfflineGameState(); window.renderPlayersTable();
    document.getElementById('playerMenuContent').style.display = 'none';
}

window.editPlayerOffline = function(id) {
    if (window.drawnNumbers.length > 0) return;
    const p = window.players[id]; if(!p) return;
    window.currentEditIdOffline = id;
    document.getElementById('offlinePlayerName').value = p.name;
    const container = document.getElementById('offlineNumberInputs'); container.innerHTML = '';
    p.numbers.forEach(num => { const inp = document.createElement('input'); inp.type='number'; inp.className='num-input-box'; inp.value=num; container.appendChild(inp); });
    document.getElementById('btnAddPlayerOffline').innerText = 'دەستکاری (Update)';
    
    document.getElementById('playerMenuContent').style.display = 'block'; document.querySelectorAll('.menu-panel').forEach(p=>p.style.display='none');
    document.getElementById('addPlayerPanel').style.display = 'block';
    setTimeout(() => { document.querySelector('.players-section').scrollIntoView({ behavior: 'smooth' }); }, 100);
}

window.deletePlayerOffline = function(id) {
    if (window.drawnNumbers.length > 0) return;
    if (window.players[id] && confirm(`ئایا تو یێ پشتڕاستی دڤێت یاریزان "${window.players[id].name}" ژێ ببەی؟`)) { 
        delete window.players[id]; window.saveOfflineGameState(); window.renderPlayersTable();
    }
}

window.clearAllPlayersOffline = function() {
    if (window.drawnNumbers.length > 0 || Object.keys(window.players).length === 0) return;
    if (confirm("ئایا تو یێ پشتڕاستی دڤێت هەمی یاریزانان ڕەش بکەی؟")) {
        window.players = {};
        window.drawnNumbers = []; window.saveOfflineGameState();
        document.getElementById('drawnNumberDisplay').innerText = '--';
        if (window.alertsEnabled.draw) { document.getElementById('matchText').innerHTML = 'چاڤەڕێی ڕاکێشانێ یە...'; document.getElementById('matchText').classList.remove('hit'); }
        window.initBoard(); window.renderPlayersTable(); window.updateRemainingCount();
        document.getElementById('playerMenuContent').style.display = 'none';
    }
}

window.updateOfflineMenuState = function() {
    if (window.gameMode !== 'offline') return;
    const isStarted = window.drawnNumbers.length > 0;
    const btnAdd = document.getElementById('addPlayerMenuBtn'), btnAddOff = document.getElementById('btnAddPlayerOffline'), btnClear = document.getElementById('btnClearAllOffline');
    const inName = document.getElementById('offlinePlayerName'), inMax = document.getElementById('offlineMaxNumInput'), numInps = document.querySelectorAll('#offlineNumberInputs .num-input-box');
    if (isStarted) {
        btnAdd.classList.add('btn-disabled'); btnAddOff.classList.add('btn-disabled'); btnClear.classList.add('btn-disabled');
        inName.disabled = true; inMax.disabled = true; numInps.forEach(i => i.disabled = true); document.getElementById('addPlayerPanel').style.display = 'none';
    } else {
        btnAdd.classList.remove('btn-disabled'); btnAddOff.classList.remove('btn-disabled'); btnClear.classList.remove('btn-disabled');
        inName.disabled = false; inMax.disabled = (Object.keys(window.players).length > 0); numInps.forEach(i => i.disabled = false);
    }
}

window.loadGlobalSettings = function() {
    const savedTheme = localStorage.getItem('bingoCustomTheme');
    if (savedTheme) { window.currentTheme = savedTheme; document.getElementById('themeSelect').value = window.currentTheme; }
    const savedLang = localStorage.getItem('bingoCustomLang');
    if (savedLang) { window.selectedLang = savedLang; document.getElementById('langSelect').value = window.selectedLang; }
}

window.changeTheme = function() { window.currentTheme = document.getElementById('themeSelect').value; window.applyTheme(); localStorage.setItem('bingoCustomTheme', window.currentTheme); }
window.applyTheme = function() { document.getElementById('mainBody').className = window.currentTheme !== 'classic' ? 'theme-' + window.currentTheme : ''; }
window.changeLanguage = function() { window.selectedLang = document.getElementById('langSelect').value; localStorage.setItem('bingoCustomLang', window.selectedLang); }
window.toggleSoundMode = function() { 
    const btn = document.getElementById('soundBtn');
    window.soundMode = (window.soundMode - 1 < 0) ? 2 : window.soundMode - 1;
    if (window.soundMode === 2) btn.innerText = "🔊 دەنگ + خواندن"; else if (window.soundMode === 1) btn.innerText = "🎵 بتنێ موزیک"; else btn.innerText = "🔇 بێ دەنگ"; 
}
window.toggleAlert = function(type) { 
    window.alertsEnabled[type] = !window.alertsEnabled[type];
    const btn = document.getElementById(type === 'draw' ? 'alertDrawBtn' : (type === 'win' ? 'alertWinBtn' : 'alertLoseBtn'));
    if (window.alertsEnabled[type]) { btn.innerText = "هەلکرن"; btn.classList.remove("off"); } else { btn.innerText = "گرتن"; btn.classList.add("off"); } 
    if (type === 'draw') { document.getElementById('matchDisplay').style.display = window.alertsEnabled.draw ? 'flex' : 'none'; } 
}

window.togglePlayerMenu = function() { 
    const m = document.getElementById('playerMenuContent');
    m.style.display = (m.style.display === 'none' || m.style.display === '') ? 'block' : 'none';
}
window.toggleSubMenu = function(id) { 
    if (id === 'addPlayerPanel' && window.drawnNumbers.length > 0) return;
    const p = document.getElementById(id); if (p.style.display === 'block') { p.style.display = 'none'; } else { document.querySelectorAll('.menu-panel').forEach(pan => pan.style.display='none'); p.style.display = 'block'; } 
}
window.addNumberBox = function(containerId) { 
    const cont = document.getElementById(containerId);
    const inp = document.createElement('input'); inp.type='number'; inp.className='num-input-box'; cont.appendChild(inp); 
}
window.showHistory = function() { 
    const list = document.getElementById('historyList');
    list.innerHTML = ''; 
    if(window.drawnNumbers.length === 0) { 
        list.innerHTML = '<span style="color:#888; font-size:14px;">هێشتا چ ژمارە نەدەرکەفتینە!</span>';
    } else { 
        window.drawnNumbers.forEach((num, idx) => { 
            const s = document.createElement('span'); s.className = 'number-circle matched'; s.style.width = '30px'; s.style.height = '30px'; s.style.lineHeight = '30px'; s.style.fontSize = '14px'; s.innerText = num; s.title = `ڕاکێشانا ژمارە ${idx + 1}`; list.appendChild(s); 
        });
    } 
    document.getElementById('historyModal').style.display = 'flex'; document.getElementById('playerMenuContent').style.display = 'none'; 
}
window.closeHistory = function() { document.getElementById('historyModal').style.display = 'none'; }
window.showAboutDeveloper = function() { document.getElementById('aboutModal').style.display = 'flex'; document.getElementById('playerMenuContent').style.display = 'none'; }
window.closeAboutDeveloper = function() { document.getElementById('aboutModal').style.display = 'none'; }

window.toggleFullscreen = function() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => { console.log(`Error attempting to enable fullscreen: ${err.message}`); });
    } else {
        if (document.exitFullscreen) { document.exitFullscreen(); }
    }
    document.getElementById('playerMenuContent').style.display = 'none';
}

window.shareGame = function() { 
    const shareData = {
        title: 'یارییا بینگۆ (1 - 99)',
        text: 'گەلەک یا خۆشە! وەرە دگەل من یارییا بینگۆ بکە ب ڕێکا ڤێ لینکێ:',
        url: 'https://bizhar-cloud.github.io/BINGO_With_BIZHAR/'
    };
    if (navigator.share) {
        navigator.share(shareData).catch(()=>{});
    } else {
        navigator.clipboard.writeText(shareData.url).then(() => {
            alert("لینکا یاریێ هاتە کۆپیکرن، نوکە دشێی ل هەر جهەکێ (پەیس - Paste) بکەی:\n\n" + shareData.url);
        });
    }
    document.getElementById('playerMenuContent').style.display = 'none';
}

window.updateAutoButtonUI = function() {
    const btn = document.getElementById('autoBtn');
    if (btn) {
        if (window.isAutoPlaying) {
            btn.innerHTML = "پاوس (Pause)";
            btn.classList.add('stop-mode');
        } else {
            btn.innerHTML = "ستارت (Start)";
            btn.classList.remove('stop-mode');
        }
    }
}

window.speakNumber = function(num) { 
    if (window.soundMode !== 2) return;
    if ('speechSynthesis' in window) { 
        window.speechSynthesis.cancel();
        const msg = new SpeechSynthesisUtterance(num.toString()); 
        
        let langCode = window.selectedLang;
        if (langCode === 'ku') langCode = 'ar'; 
        msg.lang = langCode;
        const voices = window.speechSynthesis.getVoices(); 
        if (voices.length > 0) {
            let target = voices.find(v => v.lang.startsWith(window.selectedLang));
            if (!target && window.selectedLang === 'ku') {
                target = voices.find(v => v.lang.startsWith('ar')) || voices.find(v => v.lang.startsWith('en')); 
            }
            if (target) msg.voice = target;
        } else {
            msg.rate = 1.0;
            msg.pitch = 1.1;
        }
        window.speechSynthesis.speak(msg);
    } 
}

window.playSound = function(type) { 
    if (window.soundMode === 0) return;
    if (!window.audioCtx) window.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); 
    if (window.audioCtx.state === 'suspended') window.audioCtx.resume(); 
    const osc = window.audioCtx.createOscillator();
    const gain = window.audioCtx.createGain(); osc.connect(gain); gain.connect(window.audioCtx.destination); 
    if (type === 'draw') { 
        osc.type = 'sine'; osc.frequency.setValueAtTime(800, window.audioCtx.currentTime); gain.gain.setValueAtTime(0.05, window.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, window.audioCtx.currentTime + 0.1); osc.start(); osc.stop(window.audioCtx.currentTime + 0.1); 
    } else if (type === 'safe') { 
        osc.type = 'triangle'; osc.frequency.setValueAtTime(400, window.audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, window.audioCtx.currentTime + 0.2); gain.gain.setValueAtTime(0.1, window.audioCtx.currentTime); 
        gain.gain.exponentialRampToValueAtTime(0.001, window.audioCtx.currentTime + 0.3); osc.start(); osc.stop(window.audioCtx.currentTime + 0.3);
    } else if (type === 'lose') { 
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(300, window.audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(50, window.audioCtx.currentTime + 1.5); 
        gain.gain.setValueAtTime(0.2, window.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, window.audioCtx.currentTime + 1.5); osc.start(); osc.stop(window.audioCtx.currentTime + 1.5); 
    } 
}

window.showCelebration = function(names) { 
    if (!window.alertsEnabled.win) return;
    const t = document.getElementById('celebrationToast'); t.innerHTML = `🎉 پیرۆزە 🎉<br><span class="winner-name">${names.join(' و ')}</span>تو بسەرکەفتی!`; t.classList.add('show');
    confetti({ particleCount: 150, spread: 100, origin: { y: 0.6 }, zIndex: 5000 }); clearTimeout(window.celebrationTimeout); window.celebrationTimeout = setTimeout(() => t.classList.remove('show'), 3500);
}

window.initBoard = function() {
    const b = document.getElementById('bingoBoard');
    b.innerHTML = ''; let cols = 10; if(window.maxGameNumbers <= 50) cols = 5; if(window.maxGameNumbers > 100) cols = 15;
    if(window.innerWidth < 900) cols = 10; b.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    for(let i = 1; i <= window.maxGameNumbers; i++) { 
        let c = document.createElement('div'); c.className = 'board-cell'; c.id = 'cell-' + i; c.innerText = i; 
        if(window.drawnNumbers.includes(i)) c.classList.add('drawn'); b.appendChild(c);
    }
}

window.updateRemainingCount = function() { 
    document.getElementById('remainingCountDisplay').innerText = `(${window.maxGameNumbers - window.drawnNumbers.length}/${window.maxGameNumbers}) ماینە`;
}

window.handleTouchStart = function(e) { 
    if(window.gameMode==='online' || window.drawnNumbers.length>0) return;
    window.touchstartX = e.changedTouches[0].screenX; window.touchstartY = e.changedTouches[0].screenY; 
}
window.handleTouchEnd = function(e, id) { 
    if(window.gameMode==='online' || window.drawnNumbers.length>0) return;
    let dx = Math.abs(e.changedTouches[0].screenX - window.touchstartX), dy = Math.abs(e.changedTouches[0].screenY - window.touchstartY); 
    if (dx > 50 && dx > dy) window.deletePlayerOffline(id);
}

window.renderPlayersTable = function() {
    const list = document.getElementById('playersList');
    const pArr = Object.values(window.players); if (pArr.length === 0) { list.innerHTML = ''; return; }
    const isStarted = window.drawnNumbers.length > 0;
    let tableHTML = `<table class="players-table"><thead><tr><th style="width: 30%;">ناڤ</th><th style="width: ${window.gameMode==='offline'&&!isStarted?'50%':'40%'};">ژمارە</th><th style="width: 30%;">کردار</th></tr></thead><tbody>`;
    pArr.forEach(p => {
        let numsHtml = (p.numbers||[]).map(n => `<span class="number-circle ${window.drawnNumbers.includes(n) ? 'matched' : ''}">${n}</span>`).join('');
        let rowClass = p.isSafe ? 'safe' : (p.isLoser ? 'loser' : '');
        let safeText = p.isSafe ? '<br><span class="safe-badge">(قورتال بوو)</span>' : (p.isLoser ? '<br><span class="loser-badge">(خوسارەت)</span>' : '');
        
        let muteBtnHtml = (window.gameMode === 'online' && p.id !== window.playerId) ? 
            `<button style="background: ${window.mutedPlayers[p.id] ? '#f44336' : '#4caf50'}; color: white; border: none; padding: 4px; border-radius: 4px; font-size: 11px; cursor: pointer;" onclick="window.toggleMutePlayer('${p.id}')">
                ${window.mutedPlayers[p.id] ? '🔇 بێدەنگکری' : '🔊 دەنگ ڤەکری'}
           </button>` : '';

        let actionHtml = (window.gameMode==='offline'&&!isStarted) ? `<td><div style="display:flex; gap:4px; justify-content:center;"><button class="btn-edit-table" onclick="editPlayerOffline('${p.id}')">دەستکاری</button><button class="btn-delete-table" onclick="deletePlayerOffline('${p.id}')">🗑️</button></div></td>` : (window.gameMode === 'online' ? `<td>${muteBtnHtml}</td>` : '<td>-</td>');
        
        tableHTML += `<tr class="${rowClass}" ${window.gameMode==='offline'?`ontouchstart="handleTouchStart(event)" ontouchend="handleTouchEnd(event, '${p.id}')"`:''}><td><strong>${(window.gameMode==='online'&&p.id===window.playerId)?'🟢 ':''}${p.name}</strong>${safeText}</td><td>${numsHtml}</td>${actionHtml}</tr>`;
    });
    list.innerHTML = tableHTML + `</tbody></table>`;
}

window.manualDraw = async function() {
    if (Object.keys(window.players).length < 2) { window.stopAutoMode(); alert('ب لایەنی ڤە پێدڤییە ٢ یاریزان بهێنە تۆمارکرن بۆ دەستپێکرنا یاریێ!'); return; }
    if (window.pendingAlertTimeout) return;
    if (window.drawnNumbers.length >= window.maxGameNumbers) { window.stopAutoMode(); alert('هەمی ژمارە دەرکەفتن!'); return; }
    let drawn;
    do { drawn = Math.floor(Math.random() * window.maxGameNumbers) + 1; } while (window.drawnNumbers.includes(drawn));
    if (window.gameMode === 'online') {
        if (!window.isHost) return;
        const btnDraw = document.querySelector('.btn-draw');
        if(btnDraw) btnDraw.disabled = true;
        try {
            await update(ref(db, 'rooms/' + window.roomCode), { drawnNumbers: [...window.drawnNumbers, drawn] });
        } catch(e) {}
        if(btnDraw) btnDraw.disabled = false;
    } else {
        window.drawnNumbers.push(drawn);
        window.processDrawUI(drawn, false); window.evaluateGameStateOffline(); window.saveOfflineGameState();
    }
}

window.toggleAutoDraw = function() {
    if (window.gameMode === 'online' && !window.isHost) return;
    if (Object.keys(window.players).length < 2) { alert('ب لایەنی ڤە پێدڤییە ٢ یاریزان بهێنە تۆمارکرن بۆ دەستپێکرنا یاریێ!'); return; }
    if (window.pendingAlertTimeout) return;
    if (window.isAutoPlaying) { 
        window.stopAutoMode();
    } else {
        try {
            if (!window.audioCtx && window.soundMode !== 0) window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (window.audioCtx && window.audioCtx.state === 'suspended') window.audioCtx.resume();
        } catch(e) {}
        
        let speedSecs = parseInt(document.getElementById('speedInput').value) || 3;
        window.isAutoPlaying = true; 
        window.updateAutoButtonUI();
        
        window.manualDraw(); 
        window.autoInterval = setInterval(window.manualDraw, speedSecs * 1000);
    }
}

window.stopAutoMode = function() { 
    window.isAutoPlaying = false;
    clearInterval(window.autoInterval); 
    window.updateAutoButtonUI();
}

window.processDrawUI = function(drawn, isOnlineCall) {
    if (isOnlineCall) window.drawnNumbers.push(drawn);
    window.playSound('draw'); window.speakNumber(drawn);
    const display = document.getElementById('drawnNumberDisplay'); display.innerText = drawn < 10 ? '0' + drawn : drawn; display.classList.remove('pop-animation'); void display.offsetWidth;
    display.classList.add('pop-animation');
    window.updateRemainingCount(); const cell = document.getElementById('cell-' + drawn); if(cell) cell.classList.add('drawn');
    let hit = [];
    Object.values(window.players).forEach(p => { if ((p.numbers||[]).includes(drawn)) hit.push(p.name); });
    if (window.alertsEnabled.draw) {
        const mt = document.getElementById('matchText');
        if (hit.length > 0) { mt.innerHTML = `ژمارە <span class="highlight-num">${drawn}</span> بۆ: ${hit.join(' و ')}`; mt.classList.add('hit'); setTimeout(() => mt.classList.remove('hit'), 1000); } 
        else { mt.innerHTML = `ژمارە <span class="highlight-num">${drawn}</span> دەرکەفت!<br><span style="font-size: 0.75em; color: #ccc;">(یا چ کەسان نینە)</span>`; mt.classList.remove('hit'); }
    }
    window.renderPlayersTable();
    if(isOnlineCall) window.evaluateGameStateLocal(); 
}

window.evaluateGameStateOffline = function() {
    const pArr = Object.values(window.players);
    let newlySafe = [], hasLoser = false, hasGameEnd = false, loserObj = null;
    pArr.forEach(p => { if (!p.isSafe && (p.numbers||[]).every(n => window.drawnNumbers.includes(n))) { p.isSafe = true; p.isLoser = false; newlySafe.push(p.name); } });
    let remain = pArr.filter(p => !p.isSafe);
    if (remain.length === 1 && pArr.length > 1 && pArr.some(p => p.isSafe)) { if (!remain[0].isLoser) { hasLoser = true; loserObj = remain[0]; } } 
    else if (remain.length === 0 && pArr.length > 1) { hasGameEnd = true; }

    if (newlySafe.length > 0 || hasLoser || hasGameEnd) {
        if (window.isAutoPlaying) window.stopAutoMode();
        window.pendingAlertTimeout = setTimeout(() => {
            window.saveOfflineGameState(); window.renderPlayersTable();
            if (newlySafe.length > 0) { window.playSound('safe'); window.showCelebration(newlySafe); }
            if (hasLoser) {
                loserObj.isLoser = true; window.saveOfflineGameState(); window.renderPlayersTable();
                setTimeout(() => { window.playSound('lose'); if (window.alertsEnabled.lose) { document.getElementById('loserText').innerHTML = `خوسارەت!<br><span>${loserObj.name}</span>`; document.getElementById('winnerModal').style.display = 'flex'; } }, newlySafe.length > 0 ? 3500 : 0);
            } else if (hasGameEnd && !hasLoser) {
                setTimeout(() => { 
                    if (document.getElementById('winnerModal').style.display !== 'flex' && window.alertsEnabled.lose) { document.getElementById('loserText').innerHTML = `یاری ب دوماهیک هات!<br><span style="color:var(--col-b); font-size: 0.5em; text-shadow:none;">چ خوسارەت نینن</span>`; document.getElementById('winnerModal').style.display = 'flex'; } }, newlySafe.length > 0 ? 3500 : 0);
            }
            window.pendingAlertTimeout = null;
        }, 2000); 
    }
}

window.evaluateGameStateLocal = function() {
    const playersArr = Object.values(window.players); if(playersArr.length < 2) return;
    let newlySafePlayers = []; let updatesNeeded = {};

    playersArr.forEach(p => {
        if (!p.isSafe && (p.numbers||[]).every(n => window.drawnNumbers.includes(n))) { 
            p.isSafe = true; p.isLoser = false; newlySafePlayers.push(p.name); 
            if(window.isHost) updatesNeeded[`players/${p.id}/isSafe`] = true;
        }
    });

    let remainingPlayers = playersArr.filter(p => !p.isSafe); let hasLoser = false, hasGameEnd = false, loserObj = null;
    if (remainingPlayers.length === 1 && playersArr.length > 1 && playersArr.some(p => p.isSafe)) {
        if (!remainingPlayers[0].isLoser) { hasLoser = true; loserObj = remainingPlayers[0]; if(window.isHost) updatesNeeded[`players/${loserObj.id}/isLoser`] = true; }
    } else if (remainingPlayers.length === 0 && playersArr.length > 1) { hasGameEnd = true; }

    if(window.isHost && Object.keys(updatesNeeded).length > 0) update(ref(db, 'rooms/' + window.roomCode), updatesNeeded);
    if (newlySafePlayers.length > 0 || hasLoser || hasGameEnd) {
        if (window.isAutoPlaying) window.stopAutoMode();
        window.pendingAlertTimeout = setTimeout(() => {
            window.renderPlayersTable();
            if (newlySafePlayers.length > 0) { window.playSound('safe'); window.showCelebration(newlySafePlayers); }
            if (hasLoser) {
                loserObj.isLoser = true; window.renderPlayersTable();
                setTimeout(() => { window.playSound('lose'); if (window.alertsEnabled.lose) { document.getElementById('loserText').innerHTML = `خوسارەت!<br><span>${loserObj.name}</span>`; document.getElementById('winnerModal').style.display = 'flex'; } }, newlySafePlayers.length > 0 ? 3500 : 0);
            } else if (hasGameEnd && !hasLoser) {
                setTimeout(() => { if (document.getElementById('winnerModal').style.display !== 'flex' && window.alertsEnabled.lose) { document.getElementById('loserText').innerHTML = `یاری ب دوماهیک هات!<br><span style="color:var(--col-b); font-size: 0.5em; text-shadow:none;">چ خوسارەت نینن</span>`; document.getElementById('winnerModal').style.display = 'flex'; } }, newlySafePlayers.length > 0 ? 3500 : 0);
            }
            window.pendingAlertTimeout = null;
        }, 2000); 
    }
}

window.resetGameDispatcher = async function() {
    if (window.drawnNumbers.length === 0) { document.getElementById('winnerModal').style.display = 'none'; return; }
    if (confirm("ئایا تو دڤێتی یاریێ ژ نوی دەستپێبکەی؟\n(ژمارەیێن دەرکەفتی دێ هێنە ڕەشکرن، بەلێ یاریزان دێ مینن)")) {
        
        // 🟢 ڕەشکرنا چاتێ د شاشێ دا ب تەمامی
        document.getElementById('chatMessages').innerHTML = '';

        if (window.gameMode === 'online') {
            if (!window.isHost) return;
            // 🟢 زێدەکرنا ڕەشکرنا چات و ڕیئاکشنان ژ داتابەیسێ
            let updates = { drawnNumbers: [], status: 'waiting', chat: null, reactions: null };
            Object.values(window.players).forEach(p => { updates[`players/${p.id}/isSafe`] = false; updates[`players/${p.id}/isLoser`] = false; updates[`players/${p.id}/isReady`] = false; });
            window.hasJoined = false;
            await update(ref(db, 'rooms/' + window.roomCode), updates);
        } else {
            window.drawnNumbers = [];
            Object.values(window.players).forEach(p => { p.isSafe = false; p.isLoser = false; }); 
            window.saveOfflineGameState(); window.resetLocalGameUI(); window.initBoard(); window.renderPlayersTable(); window.updateOfflineMenuState();
        }
    }
}

window.resetLocalGameUI = function() {
    window.stopAutoMode();
    if (window.pendingAlertTimeout) clearTimeout(window.pendingAlertTimeout); window.pendingAlertTimeout = null;
    if(window.gameMode === 'online') window.drawnNumbers = []; 
    clearTimeout(window.celebrationTimeout); document.getElementById('celebrationToast').classList.remove('show');
    document.getElementById('drawnNumberDisplay').innerText = '--'; 
    window.updateRemainingCount();
    if (window.alertsEnabled.draw) { document.getElementById('matchText').innerHTML = 'چاڤەڕێی ڕاکێشانێ یە...'; document.getElementById('matchText').classList.remove('hit'); }
    document.getElementById('winnerModal').style.display = 'none';

    // 🟢 زێدەکرنا ڕەشکرنا چاتێ بۆ هەمی یاریزانان ل دەمێ نوی بوونەڤەیا یاریێ
    const chatMessagesDiv = document.getElementById('chatMessages');
    if(chatMessagesDiv) chatMessagesDiv.innerHTML = '';

    if(window.gameMode === 'online') { 
        window.hasJoined = false;
        document.getElementById('btnReady').innerText = "ئامادەمە (Ready)"; document.getElementById('btnReady').disabled = false; 
        document.getElementById('setupPlayerName').disabled = false; document.querySelectorAll('#onlineNumberInputs .num-input-box').forEach(i => i.disabled = false); 
        window.renderOnlineInputs(window.requiredNumbers);
        window.showWaitingScreen();
    }
}

// --- لۆژیکا تایبەت ب Agora (چاتا دەنگی) ---
window.joinAgoraChannel = async function() {
    if (!window.agoraAppId || window.agoraAppId === "YOUR_AGORA_APP_ID_HERE") {
        console.warn("تکایە Agora App ID دابنێ د ناڤ کۆدی دا!"); return;
    }
    try {
        window.agoraClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        await window.agoraClient.join(window.agoraAppId, window.roomCode, null, window.playerId);
        window.agoraClient.on("user-published", async (user, mediaType) => {
            await window.agoraClient.subscribe(user, mediaType);
            if (mediaType === "audio") {
                window.remoteUsers[user.uid] = user;
                if (!window.mutedPlayers[user.uid] && !window.isAllMuted) {
                    user.audioTrack.play();
                }
            }
        });
        window.agoraClient.on("user-unpublished", user => {
            if (window.remoteUsers[user.uid]) { delete window.remoteUsers[user.uid]; }
        });
    } catch (error) {
        console.error("شاشی د گرێدانا Agora دا:", error);
    }
};

window.leaveAgoraChannel = async function() {
    if (window.localAudioTrack) {
        window.localAudioTrack.stop();
        window.localAudioTrack.close();
        window.localAudioTrack = null;
    }
    if (window.agoraClient) {
        await window.agoraClient.leave();
    }
};

window.toggleMyMic = async function() {
    if (!window.agoraClient) return;
    const micBtn = document.getElementById('micToggleBtn');
    const muteAllBtn = document.getElementById('muteAllBtn');
    
    if (window.isMicMuted) {
        try {
            if (!window.localAudioTrack) {
                window.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
                await window.agoraClient.publish([window.localAudioTrack]);
            } else {
                await window.localAudioTrack.setMuted(false);
            }
            window.isMicMuted = false;
            micBtn.innerText = "🎤"; micBtn.style.background = "#4caf50"; muteAllBtn.style.display = "flex";
        } catch (err) {
            alert("لێبۆڕینێ دخوازم، نەشیا مایکی ڤەکەت. پێدڤییە دەستویریێ (Allow) بدەیێ.");
        }
    } else {
        if (window.localAudioTrack) { await window.localAudioTrack.setMuted(true); }
        window.isMicMuted = true;
        micBtn.innerText = "🔇"; micBtn.style.background = "#f44336"; muteAllBtn.style.display = "none";
    }
};

window.toggleMutePlayer = function(targetPlayerId) {
    window.mutedPlayers[targetPlayerId] = !window.mutedPlayers[targetPlayerId];
    const remoteUser = window.remoteUsers[targetPlayerId];
    if (remoteUser && remoteUser.audioTrack) {
        if (window.mutedPlayers[targetPlayerId]) {
            remoteUser.audioTrack.stop();
        } else {
            remoteUser.audioTrack.play();
        }
    }
    window.renderPlayersTable();
};

window.toggleMuteAll = function() {
    const muteAllBtn = document.getElementById('muteAllBtn');
    window.isAllMuted = !window.isAllMuted;
    
    Object.values(window.players).forEach(p => {
        if (p.id !== window.playerId) {
            window.mutedPlayers[p.id] = window.isAllMuted;
            const remoteUser = window.remoteUsers[p.id];
            if (remoteUser && remoteUser.audioTrack) {
                if (window.isAllMuted) {
                    remoteUser.audioTrack.stop();
                } else {
                    remoteUser.audioTrack.play();
                }
            }
        }
    });
    if (window.isAllMuted) {
        muteAllBtn.innerText = "🔊"; muteAllBtn.style.background = "#4caf50";
    } else {
        muteAllBtn.innerText = "🔕"; muteAllBtn.style.background = "#ff9800";
    }
    window.renderPlayersTable();
};
