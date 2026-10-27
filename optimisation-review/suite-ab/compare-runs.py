#!/usr/bin/env python3
"""Compare the snapshots of two separate ab.js runs, e.g. the apps *before* an edit (run against a frozen
copy with SUITE_APPS=...) and *after* it. ab.js only diffs two builds within one run; this diffs any two
snapshot folders (results/<run>/A or /B).

  python3 compare-runs.py BEFORE_DIR AFTER_DIR [page-glob ...] [--show N] [--keep-requests]

Volatile bits are normalised the same way for both sides: the injected <style> length, version strings,
ui-grid's timestamp ids, ports, clock minutes, tippy ids. A removed jQuery <script> tag and the "jq" probe
are ignored as well, since dropping jQuery is an intended change. The SERVER/request sections are
skipped unless --keep-requests is given, because request timing varies run to run.
"""
import fnmatch, os, re, sys, difflib

args = [a for a in sys.argv[1:] if not a.startswith('--')]
show = 6
if '--show' in sys.argv:
    show = int(sys.argv[sys.argv.index('--show') + 1])
    args = [a for a in args if a != str(show)]
keep_requests = '--keep-requests' in sys.argv
if len(args) < 2:
    sys.exit(__doc__)
before, after, globs = args[0], args[1], args[2:] or ['*']

SUBS = [
    (re.compile(r'<style len=\d+>'), '<style>'),
    (re.compile(r'\d+\.\d+\.\d+-local\.[0-9a-f]+|0\.0\.0-local\.unknown'), '<ver>'),
    (re.compile(r'\bgrid\d{6,}\b'), 'grid<id>'),
    (re.compile(r'127\.0\.0\.1:\d+'), '127.0.0.1:<port>'),
    (re.compile(r'tippy-\d+'), 'tippy-<n>'),
    (re.compile(r'\b\d{1,2}:\d{2} (am|pm)\b'), '<time>'),
    (re.compile(r'"jq":"[^"]*"'), '"jq":"<jq>"'),
    (re.compile(r'"jQueryGlobal":"[^"]*"'), '"jQueryGlobal":"<jq>"'),
    (re.compile(r'jq=[^ ]+'), 'jq=<jq>'),
    (re.compile(r'timeToSettled: \d+ms'), 'timeToSettled: <t>'),
    (re.compile(r'\[\d+(\.\d+)?s\]'), ''),
]
DROP = re.compile(r'<script src="[^"]*jquery(\.min)?\.js">|^# |^\s*$')


def load(path):
    out, skipping = [], False
    with open(path, encoding='utf-8', errors='replace') as fh:
        for line in fh:
            line = line.rstrip('\n')
            if line.startswith('## '):
                skipping = (not keep_requests) and line.startswith('## SERVER')
                if line.startswith('## STEP'):
                    skipping = False
            if skipping or DROP.search(line):
                continue
            for rx, rep in SUBS:
                line = rx.sub(rep, line)
            out.append(line)
    return out


pages = sorted(f[:-4] for f in os.listdir(after) if f.endswith('.txt'))
pages = [p for p in pages if any(fnmatch.fnmatch(p, g) for g in globs)]
same = diff = missing = 0
for page in pages:
    b, a = os.path.join(before, page + '.txt'), os.path.join(after, page + '.txt')
    if not os.path.exists(b):
        print('MISSING-BEFORE', page)
        missing += 1
        continue
    d = [l for l in difflib.unified_diff(load(b), load(a), lineterm='', n=0)
         if not l.startswith(('---', '+++', '@@'))]
    if not d:
        same += 1
        print('SAME ', page)
    else:
        diff += 1
        print('DIFF ', page, '(%d lines)' % len(d))
        for l in d[:show]:
            print('     ', l[:220])
print('\n%d same, %d diff, %d missing before' % (same, diff, missing))
