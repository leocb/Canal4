const { app, screen } = require('electron'); app.whenReady().then(() => { console.log(JSON.stringify(screen.getAllDisplays()[0])); app.quit(); });
