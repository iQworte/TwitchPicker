const body = document.body

chrome.runtime.sendMessage({ event: 'offscreen_ready' })

function ensureDropsIframe(active) {
    let el = document.getElementById('iframe-drops')
    if (active) {
        if (!el) {
            el = document.createElement('iframe')
            el.id = 'iframe-drops'
            el.src = 'https://www.twitch.tv/drops/inventory'
            body.appendChild(el)
        }
    } else {
        if (el) el.remove()
    }
}

function syncStreamIframes(liveChannels) {
    const liveNames = (liveChannels || []).map((c) => c.name)
    const existing = document.querySelectorAll('iframe[id^="iframe-"]:not(#iframe-drops)')
    existing.forEach((iframe) => {
        const name = iframe.id.replace('iframe-', '')
        if (!liveNames.includes(name)) iframe.remove()
    })
    ;(liveChannels || []).forEach((ch) => {
        if (document.getElementById('iframe-' + ch.name)) return
        const iframe = document.createElement('iframe')
        iframe.id = 'iframe-' + ch.name
        iframe.src = 'https://www.twitch.tv/' + ch.name
        body.appendChild(iframe)
    })
}

function removeStreamIframe(name) {
    const el = document.getElementById('iframe-' + name)
    if (el) el.remove()
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.event === 'offscreen_sync') {
        ensureDropsIframe(!!request.dropsActive)
        syncStreamIframes(request.liveChannels)
        sendResponse({ ok: true })
        return true
    }
    if (request.event === 'offscreen_remove_iframe') {
        removeStreamIframe(request.name)
        sendResponse({ ok: true })
        return true
    }
    if (request.event === 'playSound') {
        const audio = new Audio(chrome.runtime.getURL('audio/' + (request.sound || 'notif') + '.mp3'))
        audio.volume = Math.min(1, Math.max(0, request.volume || 0.5))
        audio.play().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }))
        return true
    }
    return false
})
