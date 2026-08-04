#!/bin/bash
#
# rebuild-quickaction.sh
#
# Baut die drei Audio-Schnellaktionen neu und bettet den aktuellen Inhalt von
# audio-toggle.sh jeweils direkt ein:
#
#   Audio Kopfhörer      ⌃⇧⌘Q   -> headphones
#   Audio MacBook        ⌃⇧⌘A   -> builtin
#   Audio Lautsprecher   ⌃⇧⌘Z   -> speakers
#
# Jede Aktion ist dieselbe eingebettete Kopie des Skripts, nur mit fest
# verdrahtetem Modus (per `set -- <modus>` vorangestellt). Es wird also nicht
# mehr weitergeschaltet — jede Taste führt immer zum selben Ziel.
#
# Warum eingebettet und nicht einfach aufgerufen?
# macOS verweigert Automator-Diensten den Zugriff auf ~/Documents ("Operation
# not permitted"). Ein Dienst, der audio-toggle.sh per Pfad aufruft, scheitert
# also. Mit eingebettetem Skript entfällt der Dateizugriff komplett.
#
# Folge: Nach JEDER Änderung an audio-toggle.sh dieses Skript mit --install
# ausführen — sonst laufen die Tastenkombis weiter mit der alten Fassung.
#
# Aufruf:
#   ./rebuild-quickaction.sh              # nur neu bauen
#   ./rebuild-quickaction.sh --install    # neu bauen, installieren, Tasten setzen
#

set -e

cd "$(dirname "$0")"

SERVICES="$HOME/Library/Services"

# Name der alten, zyklisch schaltenden Aktion — wird beim Installieren entfernt.
LEGACY="Audio umschalten"

# Modus | Bundle-/Dienstname | key_equivalent | Anzeige
#   @ = cmd   ^ = ctrl   $ = shift   ~ = option
MODES=(
  "headphones|Audio Kopfhörer|@^\$q|⌃⇧⌘Q"
  "builtin|Audio MacBook|@^\$a|⌃⇧⌘A"
  "speakers|Audio Lautsprecher|@^\$z|⌃⇧⌘Z"
)

# --- Bundles bauen ------------------------------------------------------------

for entry in "${MODES[@]}"; do
  IFS='|' read -r MODE NAME KEYEQ SHOWN <<< "$entry"
  BUNDLE="$NAME.workflow"

  mkdir -p "$BUNDLE/Contents"

  cat > "$BUNDLE/Contents/Info.plist" << PLIST
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
				<string>$NAME</string>
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

  MODE="$MODE" NAME="$NAME" python3 << 'PY'
import os, plistlib, uuid

mode = os.environ['MODE']
name = os.environ['NAME']

with open('audio-toggle.sh', 'r', encoding='utf-8') as f:
    script = f.read()

lines = script.split('\n')
if lines and lines[0].startswith('#!'):
    lines = lines[1:]

# Fester Modus statt Weiterschalten: setzt $1 für das eingebettete Skript.
header = f'# Von rebuild-quickaction.sh erzeugt — fester Modus dieser Aktion.\nset -- {mode}\n\n'
inline = header + '\n'.join(lines).strip() + '\n'

ns = uuid.UUID('6f9b1c2e-4d3a-4f7b-9e51-2a8c0d6b4f13')
def uid(part):
    return str(uuid.uuid5(ns, f'{mode}:{part}')).upper()

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
    'InputUUID': uid('input'),
    'Keywords': ['Shell', 'Script', 'Command', 'Run', 'Unix'],
    'OutputUUID': uid('output'),
    'UUID': uid('action'),
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

with open(f'{name}.workflow/Contents/document.wflow', 'wb') as f:
    plistlib.dump(doc, f)

print(f'Gebaut: {name}.workflow  (Modus: {mode})')
PY
done

if [ "$1" != "--install" ]; then
  echo
  echo "Zum Installieren:  ./rebuild-quickaction.sh --install"
  exit 0
fi

# --- Installieren -------------------------------------------------------------

mkdir -p "$SERVICES"

for entry in "${MODES[@]}"; do
  IFS='|' read -r MODE NAME KEYEQ SHOWN <<< "$entry"
  rm -rf "$SERVICES/$NAME.workflow"
  cp -R "$NAME.workflow" "$SERVICES/$NAME.workflow"
  echo "Installiert: $SERVICES/$NAME.workflow"
done

# Alte, zyklisch schaltende Aktion loswerden — sonst kämpft sie um ⌃⇧⌘A.
if [ -d "$SERVICES/$LEGACY.workflow" ]; then
  rm -rf "$SERVICES/$LEGACY.workflow"
  echo "Entfernt: $SERVICES/$LEGACY.workflow"
fi

# --- Tastenkombinationen setzen ----------------------------------------------
#
# Die Zuordnung Dienst -> Taste liegt in der Domain "pbs" unter
# NSServicesStatus. Gelesen und geschrieben wird über `defaults export/import`,
# damit cfprefsd die Änderung mitbekommt und nicht überschreibt.

MODES_JOINED=$(printf '%s\n' "${MODES[@]}")
MODES_JOINED="$MODES_JOINED" LEGACY="$LEGACY" python3 << 'PY'
import os, plistlib, subprocess

legacy = os.environ['LEGACY']
entries = [l.split('|') for l in os.environ['MODES_JOINED'].splitlines() if l.strip()]

raw = subprocess.run(['defaults', 'export', 'pbs', '-'],
                     capture_output=True, check=True).stdout
prefs = plistlib.loads(raw) if raw.strip() else {}

status = prefs.get('NSServicesStatus', {})
status.pop(f'(null) - {legacy} - runWorkflowAsService', None)

for _mode, name, keyeq, shown in entries:
    status[f'(null) - {name} - runWorkflowAsService'] = {
        'key_equivalent': keyeq,
        'presentation_modes': {'ContextMenu': True, 'ServicesMenu': True, 'TouchBar': True},
    }
    print(f'Taste gesetzt: {shown}  ->  {name}')

prefs['NSServicesStatus'] = status

subprocess.run(['defaults', 'import', 'pbs', '-'],
               input=plistlib.dumps(prefs), check=True)
PY

/System/Library/CoreServices/pbs -flush 2>/dev/null || true
/System/Library/CoreServices/pbs -update 2>/dev/null || true

open -g "swiftbar://refreshallplugins" >/dev/null 2>&1 || true

echo
echo "Fertig. ⌃⇧⌘Q Kopfhörer · ⌃⇧⌘A MacBook · ⌃⇧⌘Z Lautsprecher"
echo "Greift eine Kombi in einer bereits offenen App nicht, diese App einmal neu starten."
