#!/bin/bash
#
# rebuild-quickaction.sh
#
# Baut "Audio umschalten.workflow" neu und bettet den aktuellen Inhalt von
# audio-toggle.sh direkt ein.
#
# Warum eingebettet und nicht einfach aufgerufen?
# macOS verweigert Automator-Diensten den Zugriff auf ~/Documents ("Operation
# not permitted"). Ein Dienst, der audio-toggle.sh per Pfad aufruft, scheitert
# also. Mit eingebettetem Skript entfällt der Dateizugriff komplett.
#
# Folge: Nach JEDER Änderung an audio-toggle.sh dieses Skript ausführen und
# den Ordner nach ~/Library/Services kopieren — sonst läuft die Tastenkombi
# weiter mit der alten Fassung.
#
# Aufruf:
#   ./rebuild-quickaction.sh              # nur neu bauen
#   ./rebuild-quickaction.sh --install    # neu bauen und installieren
#

set -e

cd "$(dirname "$0")"

BUNDLE="Audio umschalten.workflow"
TARGET="$HOME/Library/Services/$BUNDLE"

mkdir -p "$BUNDLE/Contents"

cat > "$BUNDLE/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSServices</key>
	<array>
		<dict>
			<key>NSMenuItem</key>
			<dict>
				<key>default</key>
				<string>Audio umschalten</string>
			</dict>
			<key>NSMessage</key>
			<string>runWorkflowAsService</string>
			<key>NSSendTypes</key>
			<array/>
			<key>NSReturnTypes</key>
			<array/>
		</dict>
	</array>
</dict>
</plist>
PLIST

python3 << 'PY'
import plistlib

with open('audio-toggle.sh', 'r', encoding='utf-8') as f:
    script = f.read()

lines = script.split('\n')
if lines and lines[0].startswith('#!'):
    lines = lines[1:]
inline = '\n'.join(lines).strip() + '\n'

action = {
    'AMAccepts': {'Container': 'List', 'Optional': True, 'Types': ['com.apple.cocoa.string']},
    'AMActionVersion': '2.0.3',
    'AMApplication': ['Automator'],
    'AMParameterProperties': {'COMMAND_STRING': {}, 'CheckedForUserDefaultShell': {},
                              'inputMethod': {}, 'shell': {}, 'source': {}},
    'AMProvides': {'Container': 'List', 'Types': ['com.apple.cocoa.string']},
    'ActionBundlePath': '/System/Library/Automator/Run Shell Script.action',
    'ActionName': 'Run Shell Script',
    'ActionParameters': {'COMMAND_STRING': inline, 'CheckedForUserDefaultShell': True,
                         'inputMethod': 0, 'shell': '/bin/bash', 'source': ''},
    'BundleIdentifier': 'com.apple.RunShellScript',
    'CFBundleVersion': '2.0.3',
    'CanShowSelectedItemsWhenRun': False,
    'CanShowWhenRun': True,
    'Category': ['AMCategoryUtilities'],
    'Class Name': 'RunShellScriptAction',
    'InputUUID': '7E3F0C42-1A55-4B6E-9C21-8D4A5F0B3E17',
    'Keywords': ['Shell', 'Script', 'Command', 'Run', 'Unix'],
    'OutputUUID': '2B9D6E10-77C4-4A38-8F52-C1E60A9D4B83',
    'UUID': 'D4A81F63-5C29-4E7B-B016-9A3F2D8C5E40',
    'UnlocalizedApplications': ['Automator'],
    'arguments': {
        '0': {'default value': 0, 'name': 'inputMethod', 'required': '0', 'type': '0', 'uuid': '0'},
        '1': {'default value': False, 'name': 'CheckedForUserDefaultShell', 'required': '0', 'type': '0', 'uuid': '1'},
        '2': {'default value': '', 'name': 'source', 'required': '0', 'type': '0', 'uuid': '2'},
        '3': {'default value': '', 'name': 'COMMAND_STRING', 'required': '0', 'type': '0', 'uuid': '3'},
        '4': {'default value': '/bin/sh', 'name': 'shell', 'required': '0', 'type': '0', 'uuid': '4'},
    },
    'isViewVisible': 1,
    'location': '309.000000:253.000000',
    'nibPath': '/System/Library/Automator/Run Shell Script.action/Contents/Resources/Base.lproj/main.nib',
}

doc = {
    'AMApplicationBuild': '528', 'AMApplicationVersion': '2.10', 'AMDocumentVersion': '2',
    'actions': [{'action': action, 'isViewVisible': 1}],
    'connectors': {},
    'workflowMetaData': {
        'serviceApplicationBundleID': '', 'serviceApplicationPath': '',
        'serviceInputTypeIdentifier': 'com.apple.Automator.nothing',
        'serviceOutputTypeIdentifier': 'com.apple.Automator.nothing',
        'serviceProcessesInput': 0,
        'workflowTypeIdentifier': 'com.apple.Automator.servicesMenu',
    },
}

with open('Audio umschalten.workflow/Contents/document.wflow', 'wb') as f:
    plistlib.dump(doc, f)

print('Eingebettet:', len(inline.split('\n')), 'Zeilen aus audio-toggle.sh')
PY

echo "Gebaut: $BUNDLE"

if [ "$1" = "--install" ]; then
  mkdir -p "$HOME/Library/Services"
  rm -rf "$TARGET"
  cp -R "$BUNDLE" "$TARGET"
  /System/Library/CoreServices/pbs -flush 2>/dev/null || true
  echo "Installiert: $TARGET"
  echo "Die Tastenkombination ⌃⇧⌘A bleibt erhalten."
else
  echo
  echo "Zum Installieren:  ./rebuild-quickaction.sh --install"
fi
