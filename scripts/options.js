var addedChannels = []
var liveChannels = []

document.addEventListener('DOMContentLoaded', async ()=> {
	addedChannels = (await getValue('addedChannels')) || []
	liveChannels = (await getValue('liveChannels')) || []
	await loadAddedList()
	await loadHistory()
	await loadSettings()
	bindSettingsListeners()
})

document.querySelector('#settings').addEventListener('click', async ()=> {
	if (document.querySelector('#settings').hasAttribute('disabled')) return
	await loadSettings()
	document.querySelector('#settings_modal').classList.toggle('active')
})

document.querySelector('#settings_modal').addEventListener('click',  (e)=> {
	if (e.target.id === 'settings_modal' || e.target.classList.contains('close')) {
		document.querySelector('#settings_modal').classList.toggle('active')
	}
})

let addChannelBtn = document.querySelector('#addChannelBtn')
document.querySelector('#addForm').addEventListener('submit', async (e)=> {
	e.preventDefault()
	if (addChannelBtn.classList.contains('wait')) return
	addChannelBtn.classList.add('wait')
	let channelName = document.querySelector('#addChannelInput').value.trim()
	if (channelName.search(/[А-яЁё]/) !== -1) {
		log('Название канала не может содержать в себе символы Русского алфавита.', '#de3f3f')
	} else if (channelName.includes(' ')) {
		log('Название канала не может содержать в себе пробелы.', '#de3f3f')
	} else if (channelName === '') {
		log('Название канала не может быть пустым.', '#de3f3f')
	} else {
		await addChannel(channelName)
	}
	document.querySelector('#addChannelInput').value = ''
	addChannelBtn.classList.remove('wait')
})

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse)=> {
    sendResponse({farewell: 'Ok'})
    if (request.event === 'update_live') {
    	liveChannels = request.live
		await loadAddedList()
    } else if (request.event === 'update_hist') {
		await loadHistory(request.history)
    }
})

async function loadAddedList() {
	let list = document.querySelector('#addedList')
	list.textContent = ''

	addedChannels.sort((a, b)=> {
	    if (liveChannels.some((channel)=> channel.name === a.login) !== liveChannels.some((channel)=> channel.name === b.login)) {
	    	if (liveChannels.some((channel)=> channel.name === a.login)) return -1
	    	else return 1
	    }
		else return 0
	})
	if (!addedChannels.length) {
		let mainDiv = document.createElement('div')
		mainDiv.textContent = 'Список пока пуст...'
		list.append(mainDiv)
	} else {
		addedChannels.forEach((channel)=> {
			let mainDiv = document.createElement('div')
			mainDiv.id = channel.login

			let nameDiv = document.createElement('div')

			let statusDiv = document.createElement('div')
			if (liveChannels.some((el)=> el.name === channel.login)) statusDiv.classList.add('status', 'online')
			else statusDiv.classList.add('status', 'offline')
			nameDiv.append(statusDiv)

			let linkA = document.createElement('a')
			linkA.href = 'https://twitch.tv/'+channel.login
			linkA.textContent = channel.login
			linkA.target = '_blank'
			nameDiv.append(linkA)

			mainDiv.append(nameDiv)

			let chattingBtn = document.createElement('img')
			chattingBtn.src = (channel.chatting) ? '/img/chatting.svg' : '/img/!chatting.svg'
			chattingBtn.addEventListener('click', async ()=> {
				if (chattingBtn.classList.contains('wait')) return
				chattingBtn.classList.add('wait')
				let chatting = await updateChatting(channel.login)
				chattingBtn.src = (chatting) ? '/img/chatting.svg' : '/img/!chatting.svg'
				chattingBtn.classList.remove('wait')
			})
			mainDiv.append(chattingBtn)

			let delButton = document.createElement('button')
			delButton.addEventListener('click', async ()=> {
				if (delButton.classList.contains('wait')) return
				delButton.classList.add('wait')
				await removeChannel(channel.login)
				delButton.classList.remove('wait')
			})
			mainDiv.append(delButton)


			list.append(mainDiv)
		})
	}
}
	

async function loadHistory(history) {
	if (history == null) history = await getValue('history')
	if (history == null) return
	let list = document.querySelector('#historyList')
	list.textContent = ''
	history.forEach((hist)=> {
		let mainDiv = document.createElement('div')
		let textDiv = document.createElement('div')
		textDiv.classList.add(hist.style)
		let textArr = hist.message.split('\n')
		textArr.forEach((el, i)=> {
			if (i !== 0) textDiv.append(document.createElement('br'))
			textDiv.append(el)
		})
		mainDiv.append(textDiv)
		let dateDiv = document.createElement('div')
		dateDiv.classList.add('date', 'time')
		dateDiv.textContent = getTime(hist.date)
		mainDiv.append(dateDiv)
		list.prepend(mainDiv)
	})
}

function getTime(timestamp) {
    let date = new Date(timestamp)
    let options = {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric'
    }
    return date.toLocaleString('ru', options)
}

async function addChannel(name) {
    name = name.toLowerCase()
    if (addedChannels.some((channel)=> channel.login === name)) {
        log('Канал '+name+' уже присутствует в отслеживаемых.', '#de3f3f')
    } else {
        addedChannels.push({login: name, priority: 0, chatting: false})
        addedChannels.sort((a, b)=> {
            if (a.login < b.login) return -1
            if (a.login > b.login) return 1
            return 0
        })
        await setValue('addedChannels', addedChannels)
        log('Канал '+name+' успешно добавлен в отслеживаемые.', '#4bb675')
        chrome.runtime.sendMessage({event: 'add_channel', login: name})
    }
}

async function updateChatting(name) {
	let value
    addedChannels.forEach((channel, i)=> {
    	if (channel.login === name) {
    		addedChannels[i].chatting = !channel.chatting
    		value = addedChannels[i].chatting 
    	}
    })
    await setValue('addedChannels', addedChannels)
    if (value) log('Сестема чат-бота для канала '+name+' была включена.', '#4bb675')
    else log('Сестема чат-бота для канала '+name+' была отключена.', '#4bb675')
    chrome.runtime.sendMessage({event: 'chatting_change', login: name, value: value})
    return value
}

async function removeChannel(name) {
    addedChannels = addedChannels.filter((channel)=> channel.login !== name)
	await setValue('addedChannels', addedChannels)
    log('Канал '+name+' удален из отслеживаемых.', '#4bb675')
    chrome.runtime.sendMessage({event: 'del_channel', login: name})
    document.getElementById(name).remove()
    let list = document.querySelectorAll('#addedList > div')
    if (list.length === 0) {
    	let mainDiv = document.createElement('div')
		mainDiv.textContent = 'Список пока пуст...'
		document.querySelector('#addedList').append(mainDiv)
    }
	await loadHistory()
}

function log(text, color) {
	let status = document.querySelector('#status')
	let textDiv = document.createElement('div')
	textDiv.style.color = color
	textDiv.textContent = text
	status.prepend(textDiv)
	setTimeout(()=> textDiv.remove(), 5000)
}

async function setValue(key, value) {
    return new Promise((resolve)=> {
        chrome.storage.local.set({[key]: value}, (data)=> {
            if (chrome.runtime.lastError) {
                console.log('Ошибка сохранение данных')
            } else {
                resolve(data)
            }
        })
    })
}

async function getValue(name) {
    return new Promise((resolve)=> {
        chrome.storage.local.get(name, (data)=> {
            if (chrome.runtime.lastError) {
                console.log('Ошибка получения сохраненных данных')
            } else {
                resolve(data[name])
            }
        })
    })
}

const DEFAULT_SETTINGS = {
	notifications: { active: true, volume: 0.5 },
	chat: { min_interval: 500000, max_interval: 950000 },
	drops: { active: true }
}

function normalizeSettings(settings) {
	if (!settings) return { ...DEFAULT_SETTINGS }
	if (settings.notifications && typeof settings.notifications.sound === 'boolean') {
		settings.notifications.volume = settings.notifications.sound ? 0.5 : 0
		delete settings.notifications.sound
	}
	return settings
}

async function loadSettings() {
	let settings = await getValue('settings')
	settings = normalizeSettings(settings)
	if (settings == null) settings = DEFAULT_SETTINGS
	document.querySelector('#chatMinSec').value = Math.round(settings.chat.min_interval / 1000)
	document.querySelector('#chatMaxSec').value = Math.round(settings.chat.max_interval / 1000)
	document.querySelector('#notificationsEnabled').checked = settings.notifications.active
	let vol = Math.round((settings.notifications.volume != null ? settings.notifications.volume : 0.5) * 100)
	document.querySelector('#notificationVolume').value = vol
	document.querySelector('#notificationVolumeValue').textContent = vol
	document.querySelector('#dropsEnabled').checked = settings.drops.active
}

function bindSettingsListeners() {
	document.querySelector('#notificationVolume').addEventListener('input', ()=> {
		document.querySelector('#notificationVolumeValue').textContent = document.querySelector('#notificationVolume').value
	})

	async function saveSettingsFromForm() {
		let settings = await getValue('settings')
		settings = normalizeSettings(settings)
		if (settings == null) settings = { ...DEFAULT_SETTINGS }
		let minSec = parseInt(document.querySelector('#chatMinSec').value, 10)
		let maxSec = parseInt(document.querySelector('#chatMaxSec').value, 10)
		settings.chat = {
			min_interval: (minSec > 0 ? minSec : 500) * 1000,
			max_interval: (maxSec > 0 ? maxSec : 950) * 1000
		}
		let vol = parseInt(document.querySelector('#notificationVolume').value, 10)
		settings.notifications = {
			active: document.querySelector('#notificationsEnabled').checked,
			volume: vol / 100
		}
		settings.drops = { active: document.querySelector('#dropsEnabled').checked }
		await setValue('settings', settings)
		chrome.runtime.sendMessage({ event: 'settings_changed', settings })
	}

	document.querySelector('#chatMinSec').addEventListener('change', saveSettingsFromForm)
	document.querySelector('#chatMaxSec').addEventListener('change', saveSettingsFromForm)
	document.querySelector('#notificationsEnabled').addEventListener('change', saveSettingsFromForm)
	document.querySelector('#notificationVolume').addEventListener('change', saveSettingsFromForm)
	document.querySelector('#dropsEnabled').addEventListener('change', saveSettingsFromForm)
}