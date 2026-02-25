;(async () => {
	try {
		const win = await chrome.windows.getCurrent()
		if (win) await chrome.sidePanel.open({ windowId: win.id })
	} catch (e) {}
	window.close()
})()