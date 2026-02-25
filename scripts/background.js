var addedChannels,
    liveChannels,
    settings

const OFFSCREEN_PATH = 'html/offscreen.html'

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})

chrome.runtime.onInstalled.addListener(async (details) => {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
    await init()
    await ensureOffscreenDocument()
    await poller()
    chrome.alarms.create('poller', { periodInMinutes: 1 })
    if (details.reason === 'install') {
        await pushHist('Расширение успешно установлено.', 'info')
        try {
            const win = await chrome.windows.getLastFocused()
            if (win) await chrome.sidePanel.open({ windowId: win.id })
        } catch (e) {}
    }
})

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'poller') await poller()
})

async function ensureOffscreenDocument() {
    const existing = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)]
    })
    if (existing.length > 0) return
    await chrome.offscreen.createDocument({
        url: OFFSCREEN_PATH,
        reasons: ['IFRAME_SCRIPTING'],
        justification: 'Background Twitch streams and drops inventory iframes'
    })
}

async function init() {
    addedChannels = await getValue('addedChannels')
    if (addedChannels == null) await setValue('addedChannels', [])

    settings = await getValue('settings')
    if (settings == null) await setValue('settings', {
        notifications: { active: true, volume: 0.5 },
        chat: { min_interval: 500000, max_interval: 950000 },
        drops: { active: true }
    })

    const dictionary = await getDictionary()
    await setValue('dictionary', dictionary)
}

async function getDictionary() {
    const url = chrome.runtime.getURL('dictionary.json')
    const response = await fetch(url)
    try {
        const data = await response.json()
        return response.ok ? data : []
    } catch {
        return []
    }
}

async function poller() {
    addedChannels = await getValue('addedChannels')
    if (!addedChannels || !addedChannels.length) return
    try {
        await checkStreamersStatus()
    } catch (e) {
        console.log('Ошибка произведения запроса:', e)
    }
}

async function checkStreamersStatus() {
    const usernames = addedChannels.map((ch) => ch.login)
    const response = await fetch('https://twitch.theorycraft.gg/channel-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ channels: usernames })
    })
    const json = await response.json()
    const prevLiveList = await getValue('liveChannels')
    const prevLive = Array.isArray(prevLiveList) ? prevLiveList.map((c) => c.name) : []
    liveChannels = []
    for (const key in json) {
        liveChannels.push({ name: key, title: json[key].game + ' - ' + json[key].title })
    }
    const newLiveNames = liveChannels.map((c) => c.name)
    for (const ch of liveChannels) {
        if (!prevLive.includes(ch.name)) {
            const message = 'Канал ' + ch.name + ' сейчас активен.\n' + ch.title + '\nФоновое подключение...'
            await sendNotification(chrome.runtime.getManifest().name, message)
            await pushHist(message)
        }
    }
    for (const name of prevLive) {
        if (!newLiveNames.includes(name)) {
            const message = 'Трансляция ' + name + ' была остановлена.\nОтключаюсь от фонового просмотра...'
            await sendNotification(chrome.runtime.getManifest().name, message)
            await pushHist(message)
        }
    }
    await setValue('liveChannels', liveChannels)
    chrome.runtime.sendMessage({ event: 'update_live', live: liveChannels })
    console.log('Сейчас стримят:', liveChannels)

    await ensureOffscreenDocument()
    chrome.runtime.sendMessage({
        event: 'offscreen_sync',
        liveChannels,
        dropsActive: settings && settings.drops && settings.drops.active
    })
}

async function sendNotification(title, message, sound = 'notif') {
    message = String(message)
    console.log(title, message)
    if (!settings || !settings.notifications || !settings.notifications.active) return
    const volume = settings.notifications.volume != null ? settings.notifications.volume : 0.5
    const notification = {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('img/icon.png'),
        title,
        message,
        silent: true
    }
    chrome.notifications.create('', notification, () => {
        if (chrome.runtime.lastError) console.warn('Notification:', chrome.runtime.lastError.message)
    })
    if (volume > 0) {
        await ensureOffscreenDocument()
        chrome.runtime.sendMessage({ event: 'playSound', sound, volume })
    }
}

async function setValue(key, value) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [key]: value }, () => {
            if (chrome.runtime.lastError) console.log('Ошибка сохранение данных')
            resolve()
        })
    })
}

async function getValue(name) {
    return new Promise((resolve) => {
        chrome.storage.local.get(name, (data) => {
            if (chrome.runtime.lastError) console.log('Ошибка получения сохраненных данных')
            resolve(data[name])
        })
    })
}

async function pushHist(message, style = 'default') {
    let history = await getValue('history')
    if (history == null) history = []
    history.push({ date: Date.now(), message, style })
    while (history.length > 1000) history.shift()
    await setValue('history', history)
    chrome.runtime.sendMessage({ event: 'update_hist', history })
}

chrome.storage.onChanged.addListener(async (changes) => {
    for (const key in changes) {
        const storageChange = changes[key]
        if (key === 'addedChannels') addedChannels = storageChange.newValue
        if (key === 'settings') {
            settings = storageChange.newValue
            await ensureOffscreenDocument()
            chrome.runtime.sendMessage({
                event: 'offscreen_sync',
                liveChannels: liveChannels || [],
                dropsActive: settings && settings.drops && settings.drops.active
            })
        }
    }
})

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.event === 'offscreen_ready') {
        chrome.runtime.sendMessage({
            event: 'offscreen_sync',
            liveChannels: liveChannels || [],
            dropsActive: settings && settings.drops && settings.drops.active
        })
        sendResponse({ farewell: 'Ok' })
        return true
    }
    if (request.event === 'settings_changed' && request.settings) {
        settings = request.settings
        ensureOffscreenDocument().then(() => {
            chrome.runtime.sendMessage({
                event: 'offscreen_sync',
                liveChannels: liveChannels || [],
                dropsActive: settings && settings.drops && settings.drops.active
            })
        })
        sendResponse({ farewell: 'Ok' })
        return true
    }
    if (request.event === 'drops') {
        sendNotification(chrome.runtime.getManifest().name, 'Новый дроп ' + request.name + ' успешно активирован.', 'extra')
        pushHist('Новый дроп ' + request.name + ' успешно активирован.', 'drops')
        sendResponse({ farewell: 'Ok' })
        return true
    }
    if (request.event === 'points') {
        pushHist('Очки с канала ' + request.login + ' были собраны.\nВаш баланс: ' + request.balance, 'points')
        sendResponse({ farewell: 'Ok' })
        return true
    }
    if (request.event === 'chatting') {
        pushHist('На канал ' + request.login + ' было отправлено сообщение: "' + request.phrase + '"', 'hint')
        sendResponse({ farewell: 'Ok' })
        return true
    }
    if (request.event === 'chatting_change') {
        pushHist(
            'Сестема чат-бота для канала ' + request.login + ' была ' + (request.value ? 'включена' : 'отключена') + '.',
            'info'
        )
        sendResponse({ farewell: 'Ok' })
        return true
    }
    if (request.event === 'add_channel') {
        pushHist('Канал ' + request.login + ' успешно добавлен в отслеживаемые.', 'info')
        poller()
        sendResponse({ farewell: 'Ok' })
        return true
    }
    if (request.event === 'del_channel') {
        pushHist('Канал ' + request.login + ' удален из отслеживаемых.', 'info')
        ensureOffscreenDocument().then(() => {
            chrome.runtime.sendMessage({ event: 'offscreen_remove_iframe', name: request.login })
        })
        sendResponse({ farewell: 'Ok' })
        return true
    }
    sendResponse({ farewell: 'Ok' })
    return true
})
