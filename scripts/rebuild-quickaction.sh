#!/bin/bash
#
# rebuild-quickaction.sh
#
# Baut die Audio-Umschalter neu und bettet den aktuellen Inhalt von
# audio-toggle.sh jeweils direkt ein:
#
#   Alfred-Workflow „Audio-Umschalter" (Haupttasten, global):
#     ⌥1   -> headphones
#     ⌥2   -> speakers
#     ⌥3   -> builtin
#
#   Automator-Schnellaktionen (Ersatz, falls Alfred nicht läuft):
#     Audio Kopfhörer      ⌃⇧⌘Q   -> headphones
#     Audio MacBook        ⌃⇧⌘A   -> builtin
#     Audio Lautsprecher   ⌃⇧⌘Z   -> speakers
#
# Warum Alfred für die Haupttasten?
# Dienste-Kürzel laufen über das Menü der aktiven App: Die App gewinnt bei
# Konflikten, und Kürzel ohne ⌘ greifen in frisch gestarteten Apps oft erst,
# nachdem man dort einmal das Dienste-Menü geöffnet hat. Alfred-Hotkeys sind
# echte globale Hotkeys — sie greifen vor jeder App, auch nur mit ⌥.
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

# Alfred-Hotkeys: Modus | macOS-Tastencode | Taste | Anzeige
#   Tastencodes: 18 = 1, 19 = 2, 20 = 3 (unabhängig vom Tastaturlayout)
#   Modifier ist überall ⌥ (option); ändern in ALFRED_MOD unten.
ALFRED_KEYS=(
  "headphones|18|1|⌥1"
  "speakers|19|2|⌥2"
  "builtin|20|3|⌥3"
)
ALFRED_MOD=524288                 # ⌥ = 524288, ⌃ = 262144, ⇧ = 131072, ⌘ = 1048576
ALFRED_BUILD="alfred-audio"       # Build-Ordner hier in scripts/
ALFRED_BUNDLE="local.asi.audio-umschalter"
ALFRED_UID="7A3E1C52-9B4D-4E8F-A1C6-3D2B5F0E9A47"   # fester Ordnername in Alfred

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

# --- Alfred-Workflow bauen ----------------------------------------------------
#
# Ein Workflow mit drei Hotkey-Triggern, jeder mit eigener eingebetteter Kopie
# von audio-toggle.sh (fester Modus wie bei den Schnellaktionen).

ALFRED_JOINED=$(printf '%s\n' "${ALFRED_KEYS[@]}")
ALFRED_JOINED="$ALFRED_JOINED" ALFRED_MOD="$ALFRED_MOD" ALFRED_BUILD="$ALFRED_BUILD" \
ALFRED_BUNDLE="$ALFRED_BUNDLE" python3 << 'PY'
import os, plistlib, uuid

entries = [l.split('|') for l in os.environ['ALFRED_JOINED'].splitlines() if l.strip()]
hotmod = int(os.environ['ALFRED_MOD'])
out_dir = os.environ['ALFRED_BUILD']

with open('audio-toggle.sh', 'r', encoding='utf-8') as f:
    lines = f.read().split('\n')
if lines and lines[0].startswith('#!'):
    lines = lines[1:]
body = '\n'.join(lines).strip() + '\n'

ns = uuid.UUID('6f9b1c2e-4d3a-4f7b-9e51-2a8c0d6b4f13')
def uid(part):
    return str(uuid.uuid5(ns, f'alfred:{part}')).upper()

objects, connections, uidata = [], {}, {}
for row, (mode, keycode, key, shown) in enumerate(entries):
    trig, act = uid(f'{mode}:trigger'), uid(f'{mode}:script')
    objects.append({
        'type': 'alfred.workflow.trigger.hotkey', 'uid': trig, 'version': 2,
        'config': {
            'action': 0, 'argument': 0,            # argument 0 = kein Argument
            'focusedappvariable': False, 'focusedappvariablename': '',
            'hotkey': int(keycode), 'hotmod': hotmod, 'hotstring': key,
            'leftcursor': False, 'modsmode': 0, 'relatedAppsMode': 0,
        },
    })
    # `set --` steht vorn und überschreibt, was Alfred als $1 mitgibt.
    header = (f'# Von rebuild-quickaction.sh erzeugt — Alfred-Hotkey {shown}, '
              f'fester Modus.\nset -- {mode}\n\n')
    objects.append({
        'type': 'alfred.workflow.action.script', 'uid': act, 'version': 2,
        'config': {
            'concurrently': False, 'escaping': 0, 'script': header + body,
            'scriptargtype': 1, 'scriptfile': '', 'type': 0,   # type 0 = /bin/bash
        },
    })
    connections[trig] = [{'destinationuid': act, 'modifiers': 0,
                          'modifiersubtext': '', 'vitoclose': False}]
    uidata[trig] = {'xpos': 40, 'ypos': 40 + row * 140}
    uidata[act] = {'xpos': 300, 'ypos': 40 + row * 140}

info = {
    'bundleid': os.environ['ALFRED_BUNDLE'],
    'category': 'Tools',
    'connections': connections,
    'createdby': '',
    'description': 'Audio-Ausgang umschalten: ' +
                   ' · '.join(f'{e[3]} {e[0]}' for e in entries),
    'disabled': False,
    'name': 'Audio-Umschalter',
    'objects': objects,
    'readme': 'Erzeugt von scripts/rebuild-quickaction.sh im asi-Repo. '
              'Nicht hier bearbeiten — Änderungen gehen beim nächsten Rebuild verloren.',
    'uidata': uidata,
    'variablesdontexport': [],
    'version': '',
    'webaddress': '',
}

os.makedirs(out_dir, exist_ok=True)
with open(os.path.join(out_dir, 'info.plist'), 'wb') as f:
    plistlib.dump(info, f)

print(f'Gebaut: {out_dir}/info.plist  (Alfred: ' +
      ', '.join(f'{e[3]} {e[0]}' for e in entries) + ')')
PY

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

# --- Alfred-Workflow installieren ---------------------------------------------
#
# Ziel ist der aktive Alfred-Einstellungsordner (prefs.json -> "current"),
# damit es auch bei synchronisierten Einstellungen stimmt. Alfred beobachtet
# den Ordner und lädt den Workflow selbst.

ALFRED_PREFS=$(python3 -c '
import json, os
p = os.path.expanduser("~/Library/Application Support/Alfred/prefs.json")
print(json.load(open(p))["current"])' 2>/dev/null || true)

if [ -n "$ALFRED_PREFS" ] && [ -d "$ALFRED_PREFS/workflows" ]; then
  ALFRED_WF="$ALFRED_PREFS/workflows/user.workflow.$ALFRED_UID"
  mkdir -p "$ALFRED_WF"
  cp "$ALFRED_BUILD/info.plist" "$ALFRED_WF/info.plist"
  echo "Installiert: $ALFRED_WF"
else
  echo "Alfred-Einstellungen nicht gefunden — Alfred-Hotkeys übersprungen."
fi

open -g "swiftbar://refreshallplugins" >/dev/null 2>&1 || true

echo
echo "Fertig."
echo "  Alfred (global):    ⌥1 Kopfhörer · ⌥2 Lautsprecher · ⌥3 MacBook"
echo "  Schnellaktionen:    ⌃⇧⌘Q Kopfhörer · ⌃⇧⌘Z Lautsprecher · ⌃⇧⌘A MacBook"
echo "Greift ⌥1–3 nicht: Alfred-Einstellungen → Workflows einmal öffnen (lädt neu)."
