// Embeds the custom app icon into the packaged .exe using rcedit.
// Needed because we set win.signAndEditExecutable=false (to avoid the winCodeSign
// download that fails on Windows without Developer Mode), which also skips icon embedding.
const path = require('path');
const { execFileSync } = require('child_process');

exports.default = async function (context) {
  if (context.electronPlatformName !== 'win32') return;
  const exeName = context.packager.appInfo.productFilename + '.exe';
  const exePath = path.join(context.appOutDir, exeName);
  const rcedit = path.join(__dirname, 'tools', 'rcedit-x64.exe');
  const icon = path.join(__dirname, 'build', 'icon.ico');
  try {
    execFileSync(rcedit, [exePath, '--set-icon', icon], { stdio: 'inherit' });
    console.log('afterPack: embedded custom icon into ' + exeName);
  } catch (e) {
    console.error('afterPack: rcedit failed - ' + e.message);
  }
};
