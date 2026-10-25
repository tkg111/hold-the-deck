// npm run app:apk: build the debug APK from android/ (run `npm run app:sync`
// first so it has the latest web build). Gradle needs JDK 21 and the
// Android SDK: JAVA_HOME and ANDROID_HOME are used when set; otherwise this
// looks in the usual install places, so a plain `npm run app:apk` works on a
// machine set up with Android Studio and Temurin 21.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const win = process.platform === 'win32';
const android = join(process.cwd(), 'android');
const env = { ...process.env };

const javaMajor = (home) => {
  const java = join(home, 'bin', win ? 'java.exe' : 'java');
  if (!existsSync(java)) return 0;
  const out = spawnSync(java, ['-version'], { encoding: 'utf8' }).stderr ?? '';
  return Number(/version "(\d+)/.exec(out)?.[1] ?? 0);
};
if (!env.JAVA_HOME || javaMajor(env.JAVA_HOME) < 21) {
  const roots = win
    ? ['C:/Program Files/Eclipse Adoptium', 'C:/Program Files/Java', 'C:/Program Files/Microsoft', 'C:/Program Files/Android/Android Studio']
    : ['/usr/lib/jvm', '/Library/Java/JavaVirtualMachines'];
  const homes = roots.filter(existsSync).flatMap((r) => [r, ...readdirSync(r).map((d) => join(r, d)), ...readdirSync(r).map((d) => join(r, d, 'Contents', 'Home'))]);
  homes.push(win ? 'C:/Program Files/Android/Android Studio/jbr' : '/Applications/Android Studio.app/Contents/jbr/Contents/Home');
  const found = homes.find((h) => javaMajor(h) >= 21);
  if (!found) {
    console.error('app:apk needs JDK 21 or newer: set JAVA_HOME to one (e.g. Eclipse Temurin 21).');
    process.exit(1);
  }
  env.JAVA_HOME = found;
}

const props = join(android, 'local.properties');
if (!existsSync(props) && !env.ANDROID_HOME && !env.ANDROID_SDK_ROOT) {
  const sdk = win ? join(env.LOCALAPPDATA ?? '', 'Android', 'Sdk')
    : process.platform === 'darwin' ? join(homedir(), 'Library', 'Android', 'sdk') : join(homedir(), 'Android', 'Sdk');
  if (!existsSync(sdk)) {
    console.error('app:apk needs the Android SDK: set ANDROID_HOME (Android Studio installs it).');
    process.exit(1);
  }
  writeFileSync(props, `sdk.dir=${sdk.replaceAll('\\', '/')}\n`);
}

const gradlew = win ? `"${join(android, 'gradlew.bat')}"` : './gradlew';
const run = spawnSync(gradlew, ['assembleDebug'], { cwd: android, env, stdio: 'inherit', shell: win });
if (run.status === 0) console.log('\nAPK: android/app/build/outputs/apk/debug/app-debug.apk');
process.exit(run.status ?? 1);
