console.log('script drops_collector.js was injected', document.location.href)

let isFramed = false
try {
	isFramed = window != window.top || document != top.document || self.location != top.location
} catch (e) {
	isFramed = false
}

if (isFramed) {						                 
	console.log('Пытаюсь собрать дропы...')
	collectDrops()
	setTimeout(()=> location.reload(), 300000)
}

function collectDrops() {
	let btns = document.querySelectorAll('[data-test-selector="DropsCampaignInProgressRewardPresentation-claim-button"]')
	if (btns.length > 0) {
		btns.forEach((btn)=> {
			let name = btn.parentElement.parentElement.parentElement.parentElement.querySelector('.CoreText-sc-1txzju1-0').textContent
			chrome.runtime.sendMessage({event: 'drops', name: name})
			btn.click()
		})
	} else {
		setTimeout(()=> collectDrops(), 5000)
	}
}