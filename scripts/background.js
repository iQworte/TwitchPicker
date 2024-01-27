var addedChannels,
    liveChannels

document.addEventListener('DOMContentLoaded', async ()=> {
    await init()
    setInterval(poller, 60000)
    poller()
    let iframe = document.createElement('iframe')
    iframe.id = 'iframe-drops'
    iframe.src = 'https://www.twitch.tv/drops/inventory'
    document.querySelector('body').append(iframe)
})

chrome.runtime.onInstalled.addListener(async (details)=> {
    if (details.reason == 'install') {
        await pushHist('Расширение успешно установлено.', 'info')
        chrome.runtime.openOptionsPage()
    }
})

async function sendNotification(title, message, sound = 'notif') {
    message = String(message)
    console.log(title, message)
    let audio = new Audio('audio/'+sound+'.mp3')
    audio.volume = 0.5
    audio.play()
    let notification = {
        type: 'basic',
        iconUrl: 'img/icon.png',
        title: title,
        message: message,
        silent: true
    }
    chrome.notifications.create('', notification, ()=> {})
}

async function init() {
    addedChannels = await getValue('addedChannels')
    if (addedChannels == null) await setValue('addedChannels', [])

    let dictionary = await getDictionary()
    await setValue('dictionary', dictionary)
}

async function poller() {
    console.log('Проверяю каналы:', addedChannels)
    try {
        await checkStreamersStatus()
    } catch (e) {
        console.log('Ошибка произведения запроса:', e)
    }
}

async function getDictionary() {
    let response = await fetch('chrome-extension://'+chrome.runtime.id+'/dictionary.json')
    try {
        let data = await response.json()
        if (!response.ok) return []
        else return data
    } catch {
        return []
    }
}

async function checkStreamersStatus() {
    let usernames = []
    addedChannels.forEach((channel)=> usernames.push(channel.login))
    let response = await fetch('https://twitch.theorycraft.gg/channel-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({channels: usernames}),
    })

    liveChannels = []
    response = await response.json()
    for (key in response) liveChannels.push({ name: key, title: response[key].game+' - '+response[key].title })
    chrome.runtime.sendMessage({event: 'update_live', live: liveChannels})
    console.log('Сейчас стримят:', liveChannels)
    let frames = document.querySelectorAll('iframe:not([id="iframe-drops"])')
    checkOfflineStreams(frames, liveChannels)
    connectToStreams(liveChannels)
}

//Создаем фоновое подключение если стример онлайн
async function connectToStreams(liveChannels, i = 0) {
    if (liveChannels.length == 0) return
    if (!document.querySelector('#iframe-'+liveChannels[i].name)) {
        let message = 'Канал '+liveChannels[i].name+' сейчас активен.\n'+liveChannels[i].title+'\nФоновое подключение...'
        sendNotification(chrome.runtime.getManifest().name, message)
        let iframe = document.createElement('iframe')
        iframe.id = 'iframe-'+liveChannels[i].name
        iframe.src = 'https://www.twitch.tv/'+liveChannels[i].name
        document.querySelector('body').append(iframe)
        pushHist(message)
    }
    if (i < liveChannels.length-1) {
        setTimeout(()=> connectToStreams(liveChannels, ++i), 2000)
    }
}

//Проверка ушел ли стример в оффлайн
async function checkOfflineStreams(frames, liveChannels, i = 0) {
    if (!frames.length) return
    console.log(frames[i])
    let iframeName = frames[i].id.split('-')[1]
    if (!liveChannels.some((elem)=> elem.name == iframeName)) {
        let message = 'Трансляция '+iframeName+' была остановлена.\nОтключаюсь от фонового просмотра...'
        sendNotification(chrome.runtime.getManifest().name, message)
        document.querySelector('#iframe-'+iframeName).remove()
        pushHist(message)
    }
    if (i < frames.length-1) {
        setTimeout(()=> checkOfflineStreams(frames, liveChannels, ++i), 2000)
    }
}

async function setValue(key, value) {
    return new Promise((resolve)=> {
        chrome.storage.local.set({[key]: value}, (data)=> {
            if (chrome.runtime.lastError) {
                console.log('Ошибка сохранение данных')
                reject(chrome.runtime.lastError)
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
                reject(chrome.runtime.lastError)
            } else {
                resolve(data[name])
            }
        })
    })
}

async function pushHist(message, style = 'default') {
    let history = await getValue('history')
    if (history == null) history = []
    let time = new Date().getTime()
    history.push({date: time, message: message, style: style})
    while (history.length > 1000) history.shift()
    setValue('history', history)
    chrome.runtime.sendMessage({event: 'update_hist', history: history})
}

chrome.storage.onChanged.addListener((changes, namespace)=> {
    for (let key in changes) {
        let storageChange = changes[key]
        if (key == 'addedChannels') addedChannels = storageChange.newValue
    }
})

chrome.webRequest.onHeadersReceived.addListener((details)=> {
    if (details.frameId <= 0) return {}
    let headers = details.responseHeaders
    let newHeaders = []
    for (let i = 0; i < headers.length; i++) {
        let header = headers[i].name.toLowerCase()
        if (header == 'x-frame-options') continue
        if (header == 'strict-transport-security') headers[i].value = 'max-age=0'
        newHeaders.push(headers[i])
    }
    return {'responseHeaders': newHeaders}
}, {'urls': ['<all_urls>']}, ['blocking', 'responseHeaders'])

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse)=> {
    sendResponse({farewell: 'Ok'})
    if (request.event == 'drops') {
        let message = 'Новый дроп '+request.name+' успешно активирован.'
        sendNotification(chrome.runtime.getManifest().name, message, 'extra')
        pushHist(message, 'drops')
    } else if (request.event == 'points') {
        pushHist('Очки с канала '+request.login+' были собраны.\nВаш баланс: '+request.balance, 'points')
    } else if (request.event == 'chatting') {
        pushHist('На канал '+request.login+' было отправлено сообщение: "'+request.phrase+'"', 'hint')
    } else if (request.event == 'chatting_change') {
        if (request.value) pushHist('Сестема чат-бота для канала '+request.login+' была включена.', 'info')
        else pushHist('Сестема чат-бота для канала '+request.login+' была отключена.', 'info')
    } else if (request.event == 'add_channel') {
        pushHist('Канал '+request.login+' успешно добавлен в отслеживаемые.', 'info')
        poller()
    } else if (request.event == 'del_channel') {
        if (document.querySelector('#iframe-'+request.login)) {
            pushHist('Канал '+request.login+' удален из отслеживаемых.\nОтключаюсь от фонового просмотра...', 'info')
            document.querySelector('#iframe-'+request.login).remove()
        } else {
            pushHist('Канал '+request.login+' удален из отслеживаемых.', 'info')
        }
    }
})