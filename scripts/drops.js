console.log('script drops_collector.js was injected', document.location.href)

let isFramed = false
try {
	isFramed = window != window.top || document != top.document || self.location != top.location
} catch (e) {
	isFramed = false
}

if (isFramed) {
	setTimeout(()=> location.reload(), 300000)
	initDrops()
}

async function getValue(name) {
	return new Promise((resolve)=> {
		chrome.storage.local.get(name, (data)=> {
			if (chrome.runtime.lastError) resolve(null)
			else resolve(data[name])
		})
	})
}

async function initDrops() {
	let settings = await getValue('settings')
	if (!settings || !settings.drops || !settings.drops.active) return
	collectDrops()
}

function collectDrops() {
	console.log('Пытаюсь собрать дропы...')

	let btns = document.querySelectorAll('.tw-tower [class*=ScCoreButton-sc]')
	btns.forEach((btn)=> {
		if (btn.parentElement.hasAttribute('aria-describedby')) return
		console.log('Нажимаю на', btn, btn.textContent)
		let name = btn.parentElement.parentElement.parentElement.parentElement.querySelector('[class*=CoreText-sc]').textContent
		chrome.runtime.sendMessage({event: 'drops', name: name})
		btn.click()
	})

	setTimeout(collectDrops, 5000)
}