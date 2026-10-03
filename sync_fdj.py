"""Public FDJ data only. No tickets, credentials or email addresses."""
import concurrent.futures, datetime, json, pathlib, re, time, urllib.request

BASE = 'https://www.pointdevente.parionssport.fdj.fr'
FILE = pathlib.Path(__file__).with_name('sports-data.json')
NOW = datetime.datetime.now(datetime.timezone.utc)

def page(path):
    if not path.startswith(('/paris-ouverts/', '/resultats/paris-termines/')):
        raise ValueError('Invalid source path')
    request = urllib.request.Request(BASE + path, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(request, timeout=25) as response:
        html = response.read().decode('utf-8')
    for script in re.findall(r'<script[^>]*>([\s\S]*?)</script>', html):
        for a, b in [('&q;', '"'), ('&s;', "'"), ('&a;', '&'), ('&l;', '<'), ('&g;', '>')]:
            script = script.replace(a, b)
        try:
            data = json.loads(script)
            if isinstance(data, dict) and 'environment' in data:
                return data
        except ValueError:
            pass
    raise ValueError('Source format unavailable')

def slug(value):
    import unicodedata
    value = ''.join(c for c in unicodedata.normalize('NFD', value) if not unicodedata.combining(c))
    return re.sub('[^a-z0-9]+', '-', value.lower()).strip('-')

def normalize(event):
    market = next((m for m in event.get('markets', []) if any(o.get('status') == 'published' and float(o.get('price') or 0) > 1 for o in m.get('outcomes', []))), None)
    if not market:
        return None
    sport, competition = event['sport'], event.get('competition') or {}
    outcomes = []
    for o in market['outcomes']:
        if o.get('status') != 'published' or float(o.get('price') or 0) <= 1:
            continue
        label = o.get('opponent', {}).get('label') if o.get('opponent') else None
        label = label or ('Draw' if o['label'] == 'N' else o['label'])
        price = float(o['price'])
        outcomes.append(dict(key=str(o['id']), label=label, short='X' if o['label'] == 'N' else o['label'], baseOdd=price, odd=round(price * 1.07 + 1e-9, 2)))
    path = f"/resultats/paris-termines/{sport['slug']}/{slug(competition['label'])}/{competition['id']}/match/{event['id']}" if competition else None
    return dict(id=f"fdj-{event['id']}-{market['id']}", eventId=event['id'], home=event['description'], away='', sport=sport['label'], competition=competition.get('label', ''), resultPath=path, startDate=event['startDate'], deadline=market.get('endValidationDate'), market=market['label'], matchNumber=market.get('index'), outcomes=outcomes, result='', demo=False, official=True)

def confirmed(event, match):
    _, event_id, market_id = match['id'].split('-')
    if str(event.get('id')) != event_id:
        return None
    markets = event.get('markets', []) + [m for g in event.get('groupedMarkets', []) for m in g.get('markets', [])]
    market = next((m for m in markets if str(m.get('id')) == market_id), None)
    if not market or market.get('status') != 'resulted':
        return None
    verdicts = {}
    for o in market.get('outcomes', []):
        if o.get('status') != 'resulted':
            continue
        verdict = {'winning': 'WON', 'loosing': 'LOST', 'losing': 'LOST', 'cancelled': 'VOID', 'canceled': 'VOID', 'void': 'VOID', 'refunded': 'VOID', 'refund': 'VOID'}.get(o.get('result'))
        if verdict:
            verdicts[str(o['id'])] = verdict
    return dict(outcomes=verdicts, confirmedAt=NOW.isoformat(), source=BASE + match['resultPath']) if verdicts else None

def main():
    previous = json.loads(FILE.read_text()) if FILE.exists() else {}
    root = page('/paris-ouverts/tous-sports')  # Failure preserves the last good snapshot.
    queue = [(s, c) for s in root['sportWithCompetitions']['sports'] for c in s['competitions']]
    matches, errors, incomplete = {}, [], []
    def competition(item):
        s, c = item
        data = page(f"/paris-ouverts/{s['slug']}/{slug(c['label'])}/{c['id']}")['eventsResolver']
        return data
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        tasks = {pool.submit(competition, item): item for item in queue}
        for task in concurrent.futures.as_completed(tasks):
            item = tasks[task]
            try:
                data = task.result()
                if data['pagination']['total'] > len(data['events']):
                    incomplete.append(item[1]['label'])
                for event in data['events']:
                    match = normalize(event)
                    if match:
                        matches[match['id']] = match
            except Exception:
                errors.append(item[1]['label'])
    if not matches:
        raise RuntimeError('No verified catalogue; previous snapshot preserved')
    # Retain known matches so results remain discoverable after betting closes.
    tracked = {m['id']: m for m in previous.get('tracked', [])}
    tracked.update(matches)
    results = previous.get('results', {})
    due = []
    for m in tracked.values():
        if m['id'] in results or not m.get('resultPath'):
            continue
        deadline = m.get('deadline') or m.get('startDate')
        if deadline and datetime.datetime.fromisoformat(deadline.replace('Z', '+00:00')) <= NOW:
            due.append(m)
    due.sort(key=lambda m: m.get('deadline') or m.get('startDate') or '', reverse=True)
    def result(match):
        data = page(match['resultPath'])
        return confirmed(data.get('eventResultedResolver') or {}, match)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        tasks = {pool.submit(result, m): m for m in due[:100]}
        for task in concurrent.futures.as_completed(tasks):
            match = tasks[task]
            try:
                verdict = task.result()
                if verdict:
                    results[match['id']] = verdict
            except Exception:
                pass  # Never infer a result from a failed request or a missing event.
    # Keep cached fixtures for failed competitions, with their existing deadlines.
    for m in previous.get('matches', []):
        if m.get('competition') in errors:
            matches.setdefault(m['id'], m)
    data = dict(schemaVersion=1, fetchedAt=NOW.isoformat(), matches=list(matches.values()), tracked=list(tracked.values()), results=results, failedCompetitions=errors, incompleteCompetitions=incomplete)
    temporary = FILE.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
    temporary.replace(FILE)
    print(f"Catalogue: {len(matches)}; confirmed markets: {len(results)}; unavailable competitions: {len(errors)}; partial competitions: {len(incomplete)}")

if __name__ == '__main__':
    main()
