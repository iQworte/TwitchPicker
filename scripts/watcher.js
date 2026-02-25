window.onload = ()=> {
	let isFramed = false
	try {
		isFramed = window != window.top || document != top.document || self.location != top.location
	} catch (e) {
		isFramed = false
	}

	if (isFramed) init()
}

var dictionary,
	streamer

async function init() {
	streamer = location.href.split('/')[3]
	let addedChannels = await getValue('addedChannels')
	if (!addedChannels.some((channel)=> channel.login === streamer)) return
	dictionary = await getValue('dictionary')

	mutePlayer()

	setInterval(()=> {
		if (!document.querySelector('[class*="claimable-bonus"]')) return
		document.querySelector('[class*="claimable-bonus"]').click()
		let balance = document.querySelector('[data-test-selector="copo-balance-string"]').textContent
		chrome.runtime.sendMessage({event: 'points', login: streamer, balance: balance})
	}, 5000)

	chat()
}

async function chat() {
	var socket, connetion
	typeof WebSocket !== 'undefined' && function connect() {
	    socket = new WebSocket('wss://irc-ws.chat.twitch.tv/')
	    socket.onopen = async ()=> {
	        console.log('Соединение с вебсокетом чата '+streamer+' уставновлено корректно.')
	        socket.send('CAP REQ :twitch.tv/tags twitch.tv/commands')
	        socket.send('PASS oauth:'+getCookie('auth-token'))
	        socket.send('NICK '+getCookie('login'))
	        socket.send('USER '+getCookie('login')+' 8 * :'+getCookie('login'))
	        connetion = true
	    }
	    socket.onerror = (err)=> {
	        console.log('Возникла ошибка на вебсокете чата '+streamer+'...')
	        socket.onclose = null
	        connetion = false
	        socket.close()
	        connect()
	    }
	    socket.onmessage = (event)=> {
	        if (event.data.includes('Welcome')) {
	        	socket.send('JOIN #'+streamer)
	        	console.log('MessageSender was running '+streamer)
	        	sendMessage()
	        } else if (event.data == 'PING :tmi.twitch.tv\r\n') {
	        	socket.send('PONG')
	        	setTimeout(()=> socket.send('PING'), 25000)
	        }
	    }
	    socket.onclose = (event)=> {
	        console.log('Вебсокет чата '+streamer+' отвалился, произвожу реконнект...')
	        connetion = false
	        connect()
	    }
	}()

	
	async function sendMessage() {
		let settings = await getValue('settings')
		let minMs = (settings && settings.chat) ? settings.chat.min_interval : 500000
		let maxMs = (settings && settings.chat) ? settings.chat.max_interval : 950000
		await sleep(randomInt(minMs, maxMs))
		let addedChannels = await getValue('addedChannels')
		let chatting = false
		addedChannels.forEach((channel)=> {
		    if (channel.login === streamer) chatting = channel.chatting
		})

		if (!chatting || !connetion) return
		let phrase = dictionary[randomInt(0, dictionary.length-1)]
		socket.send('@client-nonce='+genStr(32)+' PRIVMSG #'+streamer+' :'+phrase)
		chrome.runtime.sendMessage({event: 'chatting', login: streamer, phrase: phrase})
		sendMessage()
	}
}

function genStr(count) {
	let alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789',
	    word = ''
	for(let i = 0; i < count; i++){
	    word += alphabet[Math.round(Math.random() * (alphabet.length - 1))]
	}
	return word
}

async function getValue(name) {
    return new Promise((resolve)=> {
        chrome.storage.local.get(name, (data)=> {
            if (chrome.runtime.lastError) {
                console.log('Ошибка получения сохраненных данных')
                reject(chrome.runtime.lastError)
            } else {
                resolve(data[name])
            }
        })
    })
}

async function sleep(ms) {
    return new Promise((resolve)=> setTimeout(()=> resolve(), ms))
}

function randomInt(min, max) {
    let rand = min - 0.5 + Math.random() * (max - min + 1)
    return Math.round(rand)
}

function getCookie(name) {
	let matches = document.cookie.match(new RegExp(
	  "(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + "=([^;]*)"
	))
	return matches ? decodeURIComponent(matches[1]) : undefined
}

function mutePlayer() {
	let player = document.querySelector('video')
	if (!player) setTimeout(mutePlayer, 100)
	else player.muted = true
}