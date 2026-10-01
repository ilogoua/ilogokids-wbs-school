// Run against local Vite with PLAYWRIGHT_MODULE_PATH set when Playwright is
// supplied by the workspace runtime. API fixtures never contact the backend.
const test = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const url = process.env.NOTEBOOK_TEST_URL || 'http://127.0.0.1:5173'
const near = (a, b) => assert.ok(Math.abs(a - b) < 1, `${a} differs from ${b}`)

async function setup(t, touch, mockKeyboard = false, sensorFixture) {
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: touch ? { width: 393, height: 852 } : { width: 1440, height: 900 }, isMobile: touch, hasTouch: touch })
  if (sensorFixture) await page.addInitScript(sensorFixture)
  if (mockKeyboard) await page.addInitScript(() => {
    const keyboard = new EventTarget();
    keyboard.overlaysContent = false;
    keyboard.boundingRect = new DOMRect();
    Object.defineProperty(navigator, 'virtualKeyboard', { configurable: true, value: keyboard });
  });
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  let loggedIn = true, visibility = 'visible'
  const requests = []
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    requests.push(path)
    let status = 200, body = { ok: true, project: 'iLogoKids' }
    if (path === '/api/session') { status = loggedIn ? 200 : 401; body = { user: { id: 'fixture', publicName: 'Direx' } } }
    if (path === '/api/graph') body = { nodes: [{ id: 'root', parentNodeId: null, publicName: 'Direx', descendantCount: 1 }, { id: 'child', parentNodeId: 'root', publicName: 'Alex', descendantCount: 0 }], currentGraphNodeId: 'root' }
    if (path === '/api/profile') { if (route.request().method() === 'PATCH') visibility = route.request().postDataJSON().visibility; body = { visibility } }
    if (path === '/api/invitations') body = { token: 'a'.repeat(64) }
    if (path === '/api/logout') { loggedIn = false; status = 204; body = null }
    await route.fulfill({ status, contentType: 'application/json', body: body ? JSON.stringify(body) : '' })
  })
  await page.goto(url)
  await page.locator('.graph-node').first().waitFor()
  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(() => {
    const svg = document.querySelector('.graph-scene')
    return Math.abs(svg.viewBox.baseVal.width - svg.getBoundingClientRect().width) < 1
  })
  const cdp = await page.context().newCDPSession(page)
  const sendTouch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, x, y]) => ({ id, x, y })) })
  async function drag(from, to, inspect) {
    if (touch) {
      await sendTouch('touchStart', [[1, from.x, from.y]])
      await sendTouch('touchMove', [[1, to.x, to.y]])
      if (inspect) await inspect()
      await sendTouch('touchEnd', [])
    } else {
      await page.mouse.move(from.x, from.y); await page.mouse.down()
      await page.mouse.move(to.x, to.y, { steps: 8 })
      if (inspect) await inspect()
      await page.mouse.up()
    }
  }
  const center = async locator => { const box = await locator.boundingBox(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 } }
  return { page, errors, requests, center, drag, sendTouch, cdp }
}

async function makeBall(fixture, text = 'Local throw') {
  const { page, drag, center } = fixture;
  const area = await page.locator('.paper-drop-area').boundingBox();
  await drag(await center(page.locator('.paper-source')), { x: area.x + 90, y: area.y + 80 });
  const note = page.locator('.paper-note:not(.paper-crumpling):not(.paper-draft)');
  await note.locator('textarea').fill(text);
  const id = await note.getAttribute('data-note-id');
  await note.locator('.paper-crumple-action').click();
  const ball = page.locator(`[data-paper-id="${id}"]`);
  await ball.waitFor();
  await page.waitForFunction(id => document.querySelector(`[data-paper-id="${id}"]`)?.dataset.placed === 'true', id);
  return ball;
}

function ballPointer(fixture, touch) {
  const { page, sendTouch, center, cdp } = fixture;
  let offset = { x: 0, y: 0 };
  let contact = { x: 0, y: 0 };
  return {
    async start(ball) {
      const at = await center(ball);
      contact = at;
      if (touch) await sendTouch('touchStart', [[1, at.x, at.y]]);
      // One native press at the freshly measured point; a preceding mousemove
      // round trip lets a falling ball leave the target before the press.
      else await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', buttons: 1, clickCount: 1 });
      assert.equal(await ball.getAttribute('data-state'), 'held', `pointer catches this body: ${JSON.stringify(await ball.evaluate((el, at) => ({ at, rect: el.getBoundingClientRect().toJSON(), hit: document.elementFromPoint(at.x, at.y)?.className }), at))}`);
      const held = await center(ball);
      offset = { x: held.x - at.x, y: held.y - at.y };
      return at;
    },
    async move(at) {
      at = { x: at.x - offset.x, y: at.y - offset.y };
      contact = at;
      if (touch) await sendTouch('touchMove', [[1, at.x, at.y]]);
      else await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y, button: 'left', buttons: 1 });
    },
    async end() {
      if (touch) await sendTouch('touchEnd', []);
      else await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: contact.x, y: contact.y, button: 'left', buttons: 0, clickCount: 1 });
    },
    async place(ball, at) {
      await this.start(ball); await this.move(at);
      await page.waitForTimeout(160); // Gentle release, old motion expires.
      await this.end();
    },
  };
}

for (const touch of [false, true]) test(`catch falling paper, hold, gentle release and velocity-driven flick (${touch ? 'touch' : 'mouse'})`, async t => {
  const fixture = await setup(t, touch, false, trackedSensors);
  const { page, center, sendTouch, errors, requests } = fixture;
  const pointer = ballPointer(fixture, touch);
  await page.evaluate(() => window.setPaperGravity(0, 1));
  const graph = await page.locator('.graph-world').getAttribute('transform');
  const beforeRequests = requests.length;
  const ball = await makeBall(fixture);
  const original = await center(ball);
  await page.waitForTimeout(120);
  const falling = await center(ball);
  assert.ok(falling.y > original.y + 2 && falling.y < page.viewportSize().height - 80, 'catch while still falling');
  await pointer.start(ball);
  const held = await center(ball);
  await page.waitForTimeout(250);
  near((await center(ball)).x, held.x); near((await center(ball)).y, held.y);
  if (touch) {
    const root = await center(page.locator('.graph-node--root .node-body'));
    await sendTouch('touchStart', [[1, held.x, held.y], [2, root.x, root.y]]);
    await sendTouch('touchMove', [[1, held.x, held.y], [2, root.x + 30, root.y + 20]]);
    assert.equal(await page.locator('.graph-world').getAttribute('transform'), graph, 'second finger cannot steal ball ownership');
    assert.equal(await ball.getAttribute('data-state'), 'held');
    await sendTouch('touchEnd', []);
    await pointer.start(ball);
  }
  await pointer.move({ x: 80, y: 210 });
  near((await center(ball)).x, 80); near((await center(ball)).y, 210);
  await page.waitForTimeout(160);
  await pointer.end();
  assert.equal(await ball.getAttribute('data-state'), 'free');
  await page.waitForTimeout(180);
  assert.ok((await center(ball)).y > 220, 'gravity resumes on gentle release');

  const flick = async (steps, delay) => {
    await pointer.start(ball); await pointer.move({ x: 80, y: 210 });
    await page.waitForTimeout(160);
    for (let i = 1; i <= steps; i++) {
      await page.waitForTimeout(delay);
      await pointer.move({ x: 80 + 30 * i / steps, y: 210 });
    }
    await pointer.end();
    const release = await center(ball);
    await page.waitForTimeout(70);
    return (await center(ball)).x - release.x;
  };
  const slow = await flick(8, 30), fast = await flick(3, 8);
  assert.ok(fast > slow + 10, `faster recent flick launches faster (${fast} vs ${slow})`);
  assert.equal(await page.locator('.graph-world').getAttribute('transform'), graph, 'ball throws never drag graph');

  const width = page.viewportSize().width;
  await pointer.start(ball); await pointer.move({ x: width - 80, y: 230 });
  await page.waitForTimeout(160);
  await pointer.move({ x: width - 60, y: 230 }); await page.waitForTimeout(10);
  await pointer.move({ x: width - 35, y: 230 }); await pointer.end();
  const xs = await ball.evaluate(async element => {
    const xs = [];
    for (let i = 0; i < 14; i++) { const r = element.getBoundingClientRect(); xs.push(r.x + r.width / 2); await new Promise(resolve => setTimeout(resolve, 20)); }
    return xs;
  });
  assert.ok(Math.max(...xs) > width - 25 && xs.at(-1) < Math.max(...xs) - 2, 'missed throw bounces off physical wall');
  assert.equal(await page.locator('.notebook-deck').getAttribute('data-page'), 'schoolyard');
  assert.equal(requests.length, beforeRequests, 'all ball interactions remain local');
  await pointer.place(ball, { x: 170, y: page.viewportSize().height - 19 });
  await pointer.start(ball); await pointer.move({ x: 80, y: page.viewportSize().height - 19 });
  assert.equal(await page.locator('.notebook-deck').getAttribute('data-turn'), null, 'ball above footer keeps gesture ownership');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal(await ball.getAttribute('data-state'), 'free', 'blur cancels hold safely');
  await pointer.end();
  await page.screenshot({ path: `/tmp/ilogokids-throw-${touch ? 'touch' : 'mouse'}.png` });
  assert.deepEqual(errors, []);
});

for (const touch of [false, true]) test(`local graph pockets follow pan/zoom/rotation, pass/wedge/sink and exclude self (${touch ? 'touch' : 'mouse'})`, async t => {
  const fixture = await setup(t, touch, false, trackedSensors);
  const { page, center, drag, sendTouch, requests, errors } = fixture;
  const pointer = ballPointer(fixture, touch);
  await page.evaluate(() => window.setPaperGravity(0, 0));
  const beforeRequests = requests.length;
  const ball = await makeBall(fixture);
  const self = page.locator('[data-pocket-id="root"]');
  const other = page.locator('[data-pocket-id="child"]');
  assert.equal(await self.getAttribute('data-pocket-eligible'), 'false');
  assert.equal(await other.getAttribute('data-pocket-eligible'), 'true');
  await pointer.place(ball, await center(self.locator('.node-body')));
  await page.waitForTimeout(100);
  assert.equal(await ball.getAttribute('data-state'), 'free', 'self is never a sink');
  await pointer.place(ball, { x: 80, y: 210 });

  // Bring the actual member into a reachable location using normal graph pan.
  const child = await center(other.locator('.node-body')), root = await center(self.locator('.node-body'));
  await drag(root, { x: root.x + 270 - child.x, y: root.y + 370 - child.y });
  const radius = () => other.locator('.node-body').evaluate(el => { const m = el.getScreenCTM(); return el.r.baseVal.value * Math.hypot(m.a, m.b); });
  const zoomTo = async targetRadius => {
    for (let i = 0; i < 8; i++) {
      const current = await radius();
      if (Math.abs(current - targetRadius) < 0.05) break;
      const at = await center(other.locator('.node-body'));
      await page.mouse.move(at.x, at.y);
      await page.mouse.wheel(0, Math.log(current / targetRadius) / 0.002);
      await page.waitForTimeout(50);
    }
    assert.ok(Math.abs(await radius() - targetRadius) < 0.2);
  };
  await zoomTo(10);
  const tiny = await center(other.locator('.node-body'));
  await pointer.place(ball, tiny); await page.waitForTimeout(100);
  assert.equal(await ball.getAttribute('data-state'), 'free', 'tiny opening does not stop a ball');
  assert.equal(await other.getAttribute('data-pocket-feedback'), null, 'tiny opening never suggests drop');
  await pointer.place(ball, { x: 80, y: 210 });
  await zoomTo(19);
  await pointer.start(ball); await pointer.move(await center(other.locator('.node-body')));
  assert.equal(await other.getAttribute('data-pocket-feedback'), 'wedge-capable');
  await page.waitForTimeout(160); await pointer.end();
  await page.waitForFunction(() => document.querySelector('.paper-ball')?.dataset.state === 'wedged');
  assert.equal(await ball.getAttribute('data-pocket-id'), 'child');
  const wedged = await center(ball);
  await page.waitForTimeout(180);
  near((await center(ball)).x, wedged.x); near((await center(ball)).y, wedged.y);
  await page.screenshot({ path: `/tmp/ilogokids-wedge-${touch ? 'touch' : 'mouse'}.png` });
  await page.locator('.notebook-tabs button').nth(1).click();
  await page.waitForTimeout(550);
  assert.equal(await ball.getAttribute('data-state'), 'wedged');
  await page.locator('.notebook-tabs button').first().click(); await page.waitForTimeout(550);
  assert.equal(await ball.getAttribute('data-state'), 'wedged', 'wedged paper survives page turns');
  await pointer.place(ball, { x: 80, y: 210 });
  assert.equal(await ball.getAttribute('data-state'), 'free', 'wedged ball can be pulled out');

  await zoomTo(34);
  const oldTarget = await center(other.locator('.node-body'));
  await drag(oldTarget, { x: oldTarget.x + 35, y: oldTarget.y - 25 });
  if (touch) {
    const at = await center(other.locator('.node-body'));
    await sendTouch('touchStart', [[1, at.x - 40, at.y], [2, at.x + 40, at.y]]);
    await sendTouch('touchMove', [[1, at.x - 20, at.y - 35], [2, at.x + 20, at.y + 35]]);
    await sendTouch('touchEnd', []);
  }
  const geometry = await page.evaluate(async () => {
    const { readPaperPockets } = await import('/src/components/notebook/paperPockets.ts');
    const pockets = readPaperPockets(document.querySelector('.notebook-deck'), document.querySelector('.paper-ball-layer'));
    const node = document.querySelector('[data-pocket-id="child"] .node-body'), m = node.getScreenCTM();
    const origin = document.querySelector('.paper-ball-layer').getBoundingClientRect();
    return { pockets, expected: { x: m.e - origin.left, y: m.f - origin.top, radius: node.r.baseVal.value * Math.hypot(m.a, m.b) } };
  });
  assert.equal(geometry.pockets.length, 1);
  near(geometry.pockets[0].x, geometry.expected.x); near(geometry.pockets[0].y, geometry.expected.y); near(geometry.pockets[0].radius, geometry.expected.radius);
  assert.ok(geometry.pockets[0].radius > 30, 'visible zoomed radius, not original logical radius');
  await pointer.place(ball, oldTarget); await page.waitForTimeout(100);
  assert.equal(await ball.getAttribute('data-state'), 'free', 'old target location has no stale pocket');
  await pointer.start(ball); await pointer.move(await center(other.locator('.node-body')));
  assert.equal(await other.getAttribute('data-pocket-feedback'), 'sink-capable');
  await page.waitForTimeout(160); await pointer.end();
  await page.waitForFunction(() => document.querySelector('.paper-ball')?.dataset.state === 'sunk');
  assert.equal(await ball.getAttribute('data-pocket-id'), 'child');
  await page.waitForTimeout(500);
  assert.equal(await ball.evaluate(el => getComputedStyle(el).opacity), '0');
  assert.equal(await ball.evaluate(el => getComputedStyle(el).pointerEvents), 'none');
  assert.equal(requests.length, beforeRequests, 'sinking never makes a backend request');
  await page.screenshot({ path: `/tmp/ilogokids-sink-${touch ? 'touch' : 'mouse'}.png` });
  assert.deepEqual(errors, []);
});

for (const touch of [false, true]) test(`notebook pages, paper creation and gesture ownership (${touch ? 'touch' : 'mouse'})`, async t => {
  const { page, errors, requests, center, drag, sendTouch } = await setup(t, touch)
  const world = page.locator('.graph-world')
  const initial = await world.getAttribute('transform')
  const initialUrl = page.url()
  assert.equal(await page.locator('.graph-zoom-controls').count(), 0)
  assert.deepEqual(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]), touch ? [393, 852] : [1440, 900])
  await page.mouse.move(12, 300); await page.mouse.wheel(200, 300)
  assert.deepEqual(await page.evaluate(() => [scrollX, scrollY]), [0, 0])
  await page.locator('.notebook-tabs button').nth(1).click()
  assert.equal(await page.locator('.notebook-deck').getAttribute('data-page'), 'history')
  assert.equal(await page.locator('#schoolyard-sheet').getAttribute('inert'), '')
  await page.locator('#history-sheet h2').waitFor({ state: 'visible' })
  await page.locator('.notebook-tabs button').first().click()
  await page.waitForTimeout(550)
  assert.equal(page.url(), initialUrl)
  assert.equal(await world.getAttribute('transform'), initial)

  const root = await center(page.locator('.graph-node--root .node-body'))
  await drag(root, { x: root.x + 30, y: root.y + 25 })
  const moved = await world.getAttribute('transform')
  assert.notEqual(moved, initial)
  if (touch) {
    const point = await center(page.locator('.graph-node--root .node-body'))
    await sendTouch('touchStart', [[1, point.x - 25, point.y], [2, point.x + 25, point.y]])
    await sendTouch('touchMove', [[1, point.x - 35, point.y - 35], [2, point.x + 35, point.y + 35]])
    await sendTouch('touchEnd', [])
    const values = (await world.getAttribute('transform')).match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g).map(Number)
    near(values[2], 45)
    assert.equal(await page.evaluate(() => visualViewport.scale), 1)
  }
  const graph = await world.getAttribute('transform')
  const source = page.locator('.paper-source')
  if (touch) {
    const sourcePoint = await center(source)
    const rootPoint = await center(page.locator('.graph-node--root .node-body'))
    await sendTouch('touchStart', [[1, sourcePoint.x, sourcePoint.y]])
    await sendTouch('touchStart', [[1, sourcePoint.x, sourcePoint.y], [2, rootPoint.x, rootPoint.y]])
    await sendTouch('touchMove', [[1, sourcePoint.x, sourcePoint.y], [2, rootPoint.x + 20, rootPoint.y + 20]])
    await sendTouch('touchEnd', [])
    assert.equal(await world.getAttribute('transform'), graph, 'second finger on graph cannot steal a paper gesture')
  }
  if (touch) await page.touchscreen.tap(...Object.values(await center(source)))
  else await source.click()
  assert.equal(await page.locator('.paper-note:not(.paper-draft)').count(), 0)
  const area = await page.locator('.paper-drop-area').boundingBox()
  const target = { x: area.x + 90, y: area.y + 80 }
  const sourcePoint = await center(source)
  const beforeRequests = requests.length
  await drag(sourcePoint, target, async () => {
    assert.equal(await page.locator('.paper-draft').count(), 1)
    assert.ok((await page.locator('.paper-draft').boundingBox()).width >= 150)
  })
  const note = page.locator('.paper-note:not(.paper-draft)')
  assert.equal(await note.count(), 1)
  assert.equal(requests.length, beforeRequests, 'paper does not use an API')
  assert.equal(await world.getAttribute('transform'), graph, 'pulling paper never moves graph')
  const noteStart = await note.boundingBox()
  assert.equal(await note.locator('textarea').evaluate(el => document.activeElement === el), true, 'drop immediately focuses the note');
  await note.locator('textarea').fill('A local school note');
  const editPosition = await note.boundingBox();
  await drag(await center(note.locator('textarea')), { x: editPosition.x + 70, y: editPosition.y + 60 });
  near((await note.boundingBox()).x, editPosition.x); near((await note.boundingBox()).y, editPosition.y);
  assert.equal(await world.getAttribute('transform'), graph, 'text selection does not drag graph');
  const grab = { x: noteStart.x + 15, y: noteStart.y + 10 }
  await drag(grab, { x: grab.x + 15, y: grab.y + 20 })
  const noteEnd = await note.boundingBox()
  near(noteEnd.x - noteStart.x, 15); near(noteEnd.y - noteStart.y, 20)
  assert.equal(await world.getAttribute('transform'), graph, 'moving note never moves graph')
  await drag(await center(source), { x: 4, y: 4 })
  assert.equal(await note.count(), 1, 'outside drop does not create a duplicate')
  const valid = await note.boundingBox()
  await drag(await center(note.locator('.paper-note-grip')), { x: 4, y: 4 })
  const restored = await note.boundingBox()
  near(valid.x, restored.x); near(valid.y, restored.y)
  await drag(await center(source), target, () => page.evaluate(() => window.dispatchEvent(new Event('blur'))))
  assert.equal(await note.count(), 1, 'cancelled source creates nothing')
  await drag(await center(source), target, async () => {
    await page.locator('.notebook-tabs button').nth(1).focus()
    await page.keyboard.press('Enter')
  })
  assert.equal(await page.locator('.notebook-deck').getAttribute('data-page'), 'history')
  assert.equal(await note.count(), 1, 'page switch cancels an unfinished source')

  await page.locator('.notebook-tabs button').nth(1).click()
  await page.locator('.notebook-tabs button').first().click()
  await page.waitForTimeout(550)
  assert.equal(await note.count(), 1)
  assert.equal(await world.getAttribute('transform'), graph)
  assert.equal(await note.locator('textarea').inputValue(), 'A local school note');
  if (touch) {
    await note.locator('textarea').focus();
    const geometry = () => page.evaluate(() => {
      const selectors = ['.notebook-deck', '#schoolyard-sheet', '#schoolyard-sheet .app-header', '.graph-scene', '.paper-note:not(.paper-draft)', '.paper-trash', '.paper-stack', '.notebook-tabs'];
      return selectors.map(selector => { const el = document.querySelector(selector); const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height, getComputedStyle(el).transform] });
    });
    const before = await geometry();
    await page.setViewportSize({width:393,height:400}); await page.waitForTimeout(100);
    assert.deepEqual(await geometry(), before, 'keyboard must leave every physical object and transform unchanged');
    assert.ok(Number(await page.locator('.notebook-deck').getAttribute('data-keyboard-height')) > 0);
    assert.equal(await world.getAttribute('transform'), graph, 'keyboard resize leaves graph state unchanged');
    assert.deepEqual(await page.evaluate(()=>[scrollX,scrollY]), [0,0]);
    await note.locator('textarea').blur();
    assert.deepEqual(await geometry(), before, 'blur before keyboard closes must not adopt a reduced viewport');
    await page.setViewportSize({width:393,height:852}); await page.waitForTimeout(100);
    assert.deepEqual(await geometry(), before);
    assert.equal(await page.locator('.notebook-deck').getAttribute('data-keyboard-height'), '0');
  }
  const basket = await page.locator('.paper-trash').boundingBox();
  const oldNote = await note.boundingBox();
  await drag(await center(note.locator('.paper-note-grip')), { x: basket.x + basket.width + 5, y: basket.y + 20 });
  assert.equal(await note.count(), 1, 'near trash must not delete'); near((await note.boundingBox()).x, oldNote.x);
  await drag(await center(note.locator('.paper-note-grip')), await center(page.locator('.paper-trash')), async () => {
    assert.ok((await page.locator('.paper-trash').getAttribute('class')).includes('is-over'));
  });
  assert.equal(await note.count(), 0, 'trash removes the local note');
  assert.equal(await world.getAttribute('transform'), graph);
  await page.locator('.invitation-tab').click()
  await page.locator('#invite-email').fill('friend@example.invalid')
  await page.locator('.send-invite').click()
  await page.locator('#invite-link').waitFor()
  await page.locator('.invitation-tab').click()
  await Promise.all([page.waitForResponse(r => r.url().endsWith('/api/profile') && r.request().method() === 'PATCH'), page.locator('.visibility-control input').click()])
  await page.waitForFunction(() => !document.querySelector('.visibility-control input').checked)
  await page.getByRole('button', { name: 'English', exact: true }).click()
  assert.equal(await page.locator('.notebook-tabs button').nth(1).textContent(), 'History')
  await page.setViewportSize({ width: 360, height: 640 })
  await page.waitForTimeout(100)
  assert.deepEqual(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight, scrollX, scrollY]), [360, 640, 0, 0])
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  await page.locator('#login-nick').waitFor()
  assert.equal(await page.locator('html').getAttribute('class'), '')
  await page.goto(url + '/register?token=test')
  await page.locator('#registration-nick').waitFor()
  assert.ok(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight), 'registration still scrolls')
  assert.deepEqual(errors, [])
})

function trackedSensors() {
  // Model a sensor-capable browser with no explicit permission API. Separate
  // tests below cover browsers that require requestPermission().
  Object.defineProperty(DeviceMotionEvent, 'requestPermission', { configurable: true, value: undefined });
  Object.defineProperty(DeviceOrientationEvent, 'requestPermission', { configurable: true, value: undefined });
  const installed = new Map();
  const add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window);
  window.addEventListener = (name, listener, options) => {
    if (name === 'devicemotion' || name === 'deviceorientation') {
      if (!installed.has(name)) installed.set(name, new Set());
      installed.get(name).add(listener);
    }
    add(name, listener, options);
  };
  window.removeEventListener = (name, listener, options) => {
    installed.get(name)?.delete(listener);
    remove(name, listener, options);
  };
  window.sensorListenerCount = () => [...installed.values()].reduce((sum, entries) => sum + entries.size, 0);
  const pendingFrames = new Set();
  const request = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => {
    const id = request(time => { pendingFrames.delete(id); callback(time); });
    pendingFrames.add(id); return id;
  };
  window.cancelAnimationFrame = id => { pendingFrames.delete(id); cancel(id); };
  window.pendingFrameCount = () => pendingFrames.size;
  window.setPaperGravity = (x, y) => window.dispatchEvent(new DeviceMotionEvent('devicemotion', {
    accelerationIncludingGravity: { x: -x * 9.81, y: y * 9.81, z: Math.sqrt(Math.max(0, 1 - x * x - y * y)) * 9.81 },
    acceleration: { x: 0, y: 0, z: 0 },
  }));
  window.setScreenBasis = angle => {
    Object.defineProperty(screen.orientation, 'angle', { configurable: true, value: angle });
    screen.orientation.dispatchEvent(new Event('change'));
  };
}

for (const touch of [false, true]) test(`written note crumples after blur, uses existing tilt and preserves Schoolyard state (${touch ? 'touch' : 'mouse'})`, async t => {
  const { page, center, drag, errors, requests } = await setup(t, touch, true, trackedSensors);
  await page.evaluate(() => window.setPaperGravity(0, 0));
  const graph = await page.locator('.graph-world').getAttribute('transform');
  const beforeRequests = requests.length;
  const sheet = await page.locator('.notebook-deck').boundingBox();
  const area = await page.locator('.paper-drop-area').boundingBox();
  const target = { x: area.x + 90, y: area.y + 80 };
  await drag(await center(page.locator('.paper-source')), target);
  const note = page.locator('.paper-note:not(.paper-draft):not(.paper-crumpling)');
  const activateCrumple = async () => {
    if (touch) await page.touchscreen.tap(...Object.values(await center(note.locator('.paper-crumple-action'))));
    else await note.locator('.paper-crumple-action').click();
  };
  assert.equal(await note.locator('.paper-crumple-action').isDisabled(), true);
  await note.locator('textarea').fill('   ');
  assert.equal(await note.locator('.paper-crumple-action').isDisabled(), true);
  await note.locator('textarea').fill('A saved paper note');
  const id = await note.getAttribute('data-note-id');
  await page.evaluate(() => {
    window.ballFocusViolations = 0;
    window.paperObserver = new MutationObserver(() => {
      if (document.querySelector('.paper-ball') && document.activeElement?.matches('textarea')) window.ballFocusViolations++;
    });
    window.paperObserver.observe(document.body, { subtree: true, childList: true });
    navigator.virtualKeyboard.hide = () => {
      window.keyboardHideCalls = (window.keyboardHideCalls || 0) + 1;
      navigator.virtualKeyboard.boundingRect = new DOMRect();
      navigator.virtualKeyboard.dispatchEvent(new Event('geometrychange'));
    };
    navigator.virtualKeyboard.boundingRect = new DOMRect(0, 430, innerWidth, Math.max(0, innerHeight - 430));
    navigator.virtualKeyboard.dispatchEvent(new Event('geometrychange'));
  });
  await page.screenshot({ path: `/tmp/ilogokids-crumple-action-${touch ? 'touch' : 'desktop'}.png` });
  await activateCrumple();
  assert.equal(await page.evaluate(() => document.activeElement?.matches('textarea')), false);
  assert.equal(await page.evaluate(() => window.keyboardHideCalls), 1);
  assert.equal(await page.locator('.paper-crumpling span').textContent(), 'A saved paper note');
  assert.equal(await page.locator('.paper-ball').count(), 0, 'physics waits for crumpling');
  const ball = page.locator(`[data-paper-id="${id}"]`);
  await ball.waitFor();
  const ballBox = await ball.boundingBox();
  near(ballBox.x + ballBox.width / 2, target.x); near(ballBox.y + ballBox.height / 2, target.y);
  assert.deepEqual(await page.locator('.notebook-deck').boundingBox(), sheet, 'keyboard dismissal leaves sheet fixed');
  assert.equal(await page.evaluate(() => window.ballFocusViolations), 0);
  await page.evaluate(() => window.paperObserver.disconnect());
  const still = await ball.getAttribute('style');
  await page.waitForTimeout(150);
  assert.equal(await ball.getAttribute('style'), still, 'screen-up flat has no downward acceleration');

  // Pre-existing tilt is supplied BEFORE writing/crumpling the second note.
  await page.evaluate(() => window.setPaperGravity(0.5, 0.5));
  const secondTarget = { x: target.x + (touch ? 30 : 90), y: target.y + 140 };
  await drag(await center(page.locator('.paper-source')), secondTarget);
  await note.locator('textarea').fill('Second saved note');
  const secondId = await note.getAttribute('data-note-id');
  await activateCrumple();
  const secondBall = page.locator(`[data-paper-id="${secondId}"]`);
  await secondBall.waitFor();
  const position = await secondBall.boundingBox();
  await page.waitForTimeout(130);
  const moved = await secondBall.boundingBox();
  assert.ok(moved.x > position.x + 1 && moved.y > position.y + 1, 'new ball immediately responds to existing diagonal gravity');
  assert.equal(await page.locator('.paper-ball').count(), 2);
  assert.equal(await page.locator('.graph-world').getAttribute('transform'), graph);
  assert.equal(requests.length, beforeRequests, 'crumpling and physics stay local');
  await page.screenshot({ path: `/tmp/ilogokids-paper-balls-${touch ? 'touch' : 'desktop'}.png` });

  await page.locator('.notebook-tabs button').nth(1).click();
  await page.waitForTimeout(550);
  const paused = await page.locator('.paper-ball').evaluateAll(elements => elements.map(el => el.style.transform));
  assert.equal(await page.locator('.paper-ball-layer').getAttribute('data-active'), 'false');
  assert.equal(await ball.isVisible(), false);
  assert.equal(await page.locator('#history-sheet .paper-ball').count(), 0);
  await page.waitForTimeout(180);
  assert.deepEqual(await page.locator('.paper-ball').evaluateAll(elements => elements.map(el => el.style.transform)), paused);
  await page.locator('.notebook-tabs button').first().click();
  await page.waitForTimeout(550);
  assert.equal(await page.locator('.paper-ball').count(), 2);
  assert.equal(await page.locator('.paper-ball-layer').getAttribute('data-active'), 'true');
  assert.equal(await page.evaluate(() => window.sensorListenerCount()), 2, 'page turns do not install extra listeners');

  await page.setViewportSize({ width: 852, height: 393 });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    Object.defineProperty(screen.orientation, 'angle', { configurable: true, value: 90 });
    for (let i = 0; i < 30; i++) window.setPaperGravity(-1, 0);
  });
  await page.waitForTimeout(1400);
  for (const box of await page.locator('.paper-ball').evaluateAll(elements => elements.map(el => el.getBoundingClientRect().toJSON()))) {
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    assert.ok(x >= 16 && y >= 16 && x <= 852 - 16 && y <= 393 - 16, `rotated sheet contains ball centres: ${JSON.stringify(box)}`);
  }
  assert.equal(await page.locator('.paper-ball').count(), 2);
  await page.locator('#schoolyard-sheet .language-switch button[lang=en]').click();
  assert.equal(await page.locator('.paper-guidance span').textContent(), 'Pull out a little note');
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await page.locator('#login-nick').waitFor();
  assert.equal(await page.evaluate(() => window.sensorListenerCount()), 0, 'unmount removes sensor listeners');
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(() => window.pendingFrameCount()), 0, 'unmount cancels animation loops');
  assert.equal(await page.locator('.paper-ball-layer').count(), 0);
  assert.deepEqual(errors, []);
});

test('unavailable sensors fall straight down; reduced motion still completes crumpling', async t => {
  const { page, center, drag, errors } = await setup(t, false, false, () => {
    Object.defineProperty(window, 'DeviceMotionEvent', { value: undefined });
    Object.defineProperty(window, 'DeviceOrientationEvent', { value: undefined });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const area = await page.locator('.paper-drop-area').boundingBox();
  await drag(await center(page.locator('.paper-source')), { x: area.x + 90, y: area.y + 80 });
  await page.locator('.paper-note textarea').fill('Fallback paper');
  await page.locator('.paper-crumple-action').click();
  const ball = page.locator('.paper-ball');
  await ball.waitFor();
  const before = await ball.boundingBox();
  await page.waitForTimeout(180);
  const after = await ball.boundingBox();
  near(before.x, after.x); assert.ok(after.y > before.y + 2);
  assert.equal(await page.locator('.paper-tilt-permission').count(), 0);
  assert.deepEqual(errors, []);
});

test('turning Schoolyard away during crumpling preserves one paused ball and resumes it on return', async t => {
  const { page, center, drag, errors } = await setup(t, false, false, trackedSensors);
  await page.evaluate(() => window.setPaperGravity(0, 0));
  const area = await page.locator('.paper-drop-area').boundingBox();
  await drag(await center(page.locator('.paper-source')), { x: area.x + 90, y: area.y + 80 });
  await page.locator('.paper-note textarea').fill('Turning paper');
  const id = await page.locator('.paper-note').getAttribute('data-note-id');
  await page.locator('.paper-crumple-action').click();
  await page.locator('.notebook-tabs button').nth(1).click();
  await page.waitForTimeout(550);
  assert.equal(await page.locator('.paper-crumpling').count(), 0);
  assert.equal(await page.locator('.paper-ball').count(), 1);
  assert.equal(await page.locator('.paper-ball').getAttribute('data-paper-id'), id);
  assert.equal(await page.locator('.paper-ball').isVisible(), false);
  assert.equal(await page.locator('.paper-ball-layer').getAttribute('data-active'), 'false');
  await page.locator('.notebook-tabs button').first().click();
  await page.waitForTimeout(550);
  assert.equal(await page.locator('.paper-ball').count(), 1);
  assert.equal(await page.locator('.paper-ball').isVisible(), true);
  assert.deepEqual(errors, []);
});

for (const permission of ['granted', 'denied']) test(`sensor activation is a small user action and ${permission} is handled`, async t => {
  const { page, center, drag, errors } = await setup(t, false, false, () => {
    window.permissionRequests = 0;
    DeviceMotionEvent.requestPermission = async () => { window.permissionRequests++; return window.testPermission; };
    DeviceOrientationEvent.requestPermission = async () => { window.permissionRequests++; return window.testPermission; };
  });
  await page.evaluate(value => { window.testPermission = value; }, permission);
  assert.equal(await page.evaluate(() => window.permissionRequests), 0);
  await page.locator('.paper-tilt-permission').click();
  assert.equal(await page.evaluate(() => window.permissionRequests), 2);
  await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 0, gamma: 0 })));
  const area = await page.locator('.paper-drop-area').boundingBox();
  await drag(await center(page.locator('.paper-source')), { x: area.x + 90, y: area.y + 80 });
  await page.locator('.paper-note textarea').fill('Permission paper');
  await page.locator('.paper-crumple-action').click();
  await page.locator('.paper-ball').waitFor();
  const before = await page.locator('.paper-ball').getAttribute('style');
  await page.waitForTimeout(140);
  const after = await page.locator('.paper-ball').getAttribute('style');
  if (permission === 'granted') assert.equal(after, before, 'flat orientation is active');
  else assert.notEqual(after, before, 'denied permission falls back');
  assert.deepEqual(errors, []);
});


test('page turn uses perspective and respects reduced motion without changing graph state', async t => {
  const { page } = await setup(t, false)
  const original = await page.locator('.graph-world').getAttribute('transform')
  await page.locator('.notebook-tabs button').nth(1).click()
  const leaf = page.locator('#schoolyard-sheet.turn-forward');
  assert.equal(await leaf.evaluate(el=>getComputedStyle(el).animationName), 'sheet-forward');
  assert.equal(await leaf.locator('.app-header .wordmark').count(), 1);
  assert.equal(await leaf.locator('.paper-stack').count(), 1);
  assert.equal(await page.locator('#history-sheet .app-header .wordmark').count(), 1);
  assert.equal(await leaf.locator('.header-actions .language-switch').count(), 1);
  assert.equal(await leaf.locator('.logout-button').count(), 1);
  assert.equal(await leaf.locator('.icon-button').count(), 2);
  assert.equal(await page.locator('#history-sheet .header-actions, #history-sheet .app-header button').count(), 0);
  assert.equal(await leaf.evaluate(el => el.clientHeight), await page.locator('.notebook-deck').evaluate(el => el.clientHeight), 'turning leaf remains a full sheet');
  assert.equal(await page.locator('.notebook-page > .app-header').count(), 0);
  await page.waitForTimeout(180);
  assert.notEqual(await leaf.evaluate(el=>getComputedStyle(el).transform), 'none');
  await page.waitForTimeout(550)
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.locator('.notebook-tabs button').first().click()
  assert.equal(await page.locator('.notebook-sheet.turn-forward, .notebook-sheet.turn-back').evaluate(el=>getComputedStyle(el).animationName), 'sheet-fade')
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.graph-world').getAttribute('transform'), original)
})


test('VirtualKeyboard overlay reports a sheet-relative floor without moving paper or graph', async t => {
  const { page, center, drag } = await setup(t, true, true);
  assert.equal(await page.evaluate(() => navigator.virtualKeyboard.overlaysContent), true);
  assert.ok((await page.locator('meta[name=viewport]').getAttribute('content')).includes('interactive-widget=overlays-content'));
  const area = await page.locator('.paper-drop-area').boundingBox();
  await drag(await center(page.locator('.paper-source')), { x: area.x + 90, y: area.y + 80 });
  const note = page.locator('.paper-note:not(.paper-draft)');
  await note.locator('textarea').fill('First note');
  await drag(await center(page.locator('.paper-source')), { x: area.x + 90, y: area.y + 210 });
  assert.equal(await note.count(), 2);
  const geometry = () => page.evaluate(() => ({
    objects: [...document.querySelectorAll('#schoolyard-sheet, #schoolyard-sheet .app-header, .paper-note:not(.paper-draft), .paper-trash, .paper-stack, .notebook-tabs')].map(el => {
      const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height, getComputedStyle(el).transform];
    }), graph: document.querySelector('.graph-world').getAttribute('transform'),
  }));
  const before = await geometry();
  await page.evaluate(() => {
    navigator.virtualKeyboard.boundingRect = new DOMRect(0, 430, innerWidth, innerHeight - 430);
    navigator.virtualKeyboard.dispatchEvent(new Event('geometrychange'));
  });
  await page.waitForTimeout(80);
  assert.equal(await page.locator('.notebook-deck').getAttribute('data-keyboard-source'), 'virtual-keyboard');
  assert.equal(await page.locator('.notebook-deck').getAttribute('data-keyboard-top'), '430');
  assert.deepEqual(await geometry(), before);
  await page.evaluate(() => {
    navigator.virtualKeyboard.boundingRect = new DOMRect();
    navigator.virtualKeyboard.dispatchEvent(new Event('geometrychange'));
  });
  await page.waitForTimeout(80);
  assert.deepEqual(await geometry(), before);
  assert.equal(await page.locator('.notebook-deck').getAttribute('data-keyboard-height'), '0');
  await page.setViewportSize({width:852,height:393});
  await page.waitForTimeout(200);
  const rotated = await page.locator('.notebook-deck').boundingBox();
  near(rotated.width, 852); near(rotated.height, 393);
  assert.equal(await page.locator('.graph-world').getAttribute('transform'), before.graph);
  await page.locator('#schoolyard-sheet .language-switch button[lang=en]').click();
  assert.equal(await page.locator('.paper-guidance span').textContent(), 'Pull out a little note');
  await page.screenshot({path:'/tmp/ilogokids-notebook-landscape.png'});
  await page.setViewportSize({width:393,height:852});
  await page.waitForTimeout(200);
  await page.screenshot({path:'/tmp/ilogokids-notebook-portrait.png'});
  await page.locator('.notebook-tabs button').nth(1).click();
  await page.waitForTimeout(150);
  await page.screenshot({path:'/tmp/ilogokids-notebook-turn.png'});
  await page.waitForTimeout(400);
  await page.screenshot({path:'/tmp/ilogokids-notebook-history.png'});
});

test('VisualViewport-only fallback records occlusion and ignores keyboard pan', async t => {
  const { page, center, drag } = await setup(t, true);
  const area = await page.locator('.paper-drop-area').boundingBox();
  await drag(await center(page.locator('.paper-source')), {x:area.x+90,y:area.y+80});
  const snapshot = () => page.evaluate(() => ({
    sheet: document.querySelector('.notebook-deck').getAttribute('style'),
    note: document.querySelector('.paper-note:not(.paper-draft)').getAttribute('style'),
    graph: document.querySelector('.graph-world').getAttribute('transform'),
    trash: document.querySelector('.paper-trash').getBoundingClientRect().toJSON(),
    header: document.querySelector('#schoolyard-sheet .app-header').getBoundingClientRect().toJSON(),
  }));
  const before = await snapshot();
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, 'height', {configurable:true,value:360});
    Object.defineProperty(visualViewport, 'offsetTop', {configurable:true,value:40});
    visualViewport.dispatchEvent(new Event('resize'));
    visualViewport.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.notebook-deck').getAttribute('data-keyboard-source'), 'visual-viewport');
  assert.equal(await page.locator('.notebook-deck').getAttribute('data-keyboard-top'), '400');
  assert.deepEqual(await snapshot(), before);
  await page.locator('.paper-note textarea').fill('Still editable');
  await page.locator('.paper-note textarea').blur();
  await page.locator('.paper-note textarea').focus();
  assert.equal(await page.locator('.paper-note textarea').inputValue(), 'Still editable');
  await page.evaluate(() => {
    delete visualViewport.height; delete visualViewport.offsetTop;
    visualViewport.dispatchEvent(new Event('resize'));
  });
  await page.waitForTimeout(100);
  assert.deepEqual(await snapshot(), before);
  assert.equal(await page.locator('.notebook-deck').getAttribute('data-keyboard-height'), '0');
});

for (const touch of [false, true]) test(`footer drag shares page turns and leaves notes/graph intact (${touch ? 'touch' : 'mouse'})`, async t => {
  const { page, center, drag, sendTouch, requests, errors } = await setup(t, touch)
  const deck = page.locator('.notebook-deck')
  const schoolFooter = page.locator('#schoolyard-sheet .sheet-footer')
  const world = page.locator('.graph-world')
  const graph = await world.getAttribute('transform')
  const beforeRequests = requests.length
  const basket = await page.locator('.paper-trash').boundingBox()
  // Reproduce the physical gesture above the basket, outside the former 48px strip.
  const origin = { x: (await deck.boundingBox()).width * 0.45, y: basket.y - 30 }
  assert.equal(await page.evaluate(p => document.elementFromPoint(p.x, p.y).className, origin), 'sheet-footer')
  const basketPoint = await center(page.locator('.paper-trash'))
  await drag(basketPoint, { x: basketPoint.x - 110, y: basketPoint.y })
  assert.equal(await deck.getAttribute('data-page'), 'schoolyard', 'basket does not start a page turn')
  assert.equal(await world.getAttribute('transform'), graph, 'basket does not move graph')
  const currentTransform = () => page.locator('.notebook-sheet.is-current').evaluate(el => getComputedStyle(el).transform)
  await drag(origin, { x: origin.x - 24, y: origin.y }, async () => {
    assert.notEqual(await currentTransform(), 'none', 'short drag lifts the sheet')
  })
  await page.waitForTimeout(250)
  assert.equal(await deck.getAttribute('data-page'), 'schoolyard')
  assert.equal(await currentTransform(), 'none', 'short drag settles back')
  await drag(origin, { x: origin.x + 90, y: origin.y })
  await page.waitForTimeout(250)
  assert.equal(await deck.getAttribute('data-page'), 'schoolyard', 'first page has no predecessor')
  await drag(origin, { x: origin.x - 20, y: origin.y - 90 })
  assert.equal(await deck.getAttribute('data-page'), 'schoolyard', 'vertical intent does not turn')
  await drag(origin, { x: origin.x - 110, y: origin.y }, () => page.evaluate(() => window.dispatchEvent(new Event('blur'))))
  assert.equal(await deck.getAttribute('data-page'), 'schoolyard', 'interrupted gesture cancels')
  await page.waitForTimeout(250)
  if (touch) {
    for (const second of [{ x: origin.x + 40, y: origin.y }, await center(page.locator('.graph-node--root .node-body'))]) {
      await sendTouch('touchStart', [[1, origin.x, origin.y]])
      await sendTouch('touchMove', [[1, origin.x - 24, origin.y]])
      await sendTouch('touchStart', [[1, origin.x - 24, origin.y], [2, second.x, second.y]])
      await sendTouch('touchMove', [[1, origin.x - 110, origin.y], [2, second.x + 20, second.y + 20]])
      await sendTouch('touchEnd', [])
      assert.equal(await deck.getAttribute('data-page'), 'schoolyard', 'second finger on footer or graph cancels footer drag')
      assert.equal(await world.getAttribute('transform'), graph, 'graph cannot steal a footer gesture')
      assert.equal(await page.evaluate(() => visualViewport.scale), 1)
      await page.waitForTimeout(250)
    }
  }
  const tabs = page.locator('.notebook-tabs button')
  const tabTransforms = await tabs.evaluateAll(elements => elements.map(el => getComputedStyle(el).transform))
  await drag(origin, { x: origin.x - 110, y: origin.y })
  assert.equal(await deck.getAttribute('data-page'), 'history')
  assert.equal(await deck.getAttribute('data-turn'), 'forward')
  assert.equal(await tabs.nth(1).getAttribute('aria-pressed'), 'true')
  assert.equal(await page.locator('#schoolyard-sheet').getAttribute('inert'), '')
  await page.waitForTimeout(550)
  const turnedTabs = await tabs.evaluateAll(elements => elements.map(el => getComputedStyle(el).transform))
  assert.notEqual(turnedTabs[0], tabTransforms[0], 'old bookmark recedes')
  assert.notEqual(turnedTabs[1], tabTransforms[1], 'new bookmark pulls out')
  const historyOrigin = { x: 20, y: origin.y }
  assert.equal(await page.evaluate(p => document.elementFromPoint(p.x, p.y).className, historyOrigin), 'sheet-footer', 'lower binding margin accepts drag too')
  await drag(historyOrigin, { x: historyOrigin.x - 110, y: historyOrigin.y })
  await page.waitForTimeout(250)
  assert.equal(await deck.getAttribute('data-page'), 'history', 'last page has no successor')
  await drag(historyOrigin, { x: historyOrigin.x + 110, y: historyOrigin.y })
  assert.equal(await deck.getAttribute('data-page'), 'schoolyard')
  assert.equal(await deck.getAttribute('data-turn'), 'back')
  await page.waitForTimeout(550)
  assert.equal(await world.getAttribute('transform'), graph)
  assert.equal(requests.length, beforeRequests, 'page gestures never request APIs')

  const area = await page.locator('.paper-drop-area').boundingBox()
  await drag(await center(page.locator('.paper-source')), { x: area.x + 90, y: area.y + 80 })
  const note = page.locator('.paper-note:not(.paper-draft)')
  await note.locator('textarea').fill('Keep this note')
  const noteStyle = await note.getAttribute('style')
  await drag(await center(note.locator('textarea')), { x: area.x + 130, y: area.y + 90 })
  assert.equal(await deck.getAttribute('data-page'), 'schoolyard', 'editing cannot start a page turn')
  assert.equal(await note.getAttribute('style'), noteStyle)
  const noteBox = await note.boundingBox()
  const lowNote = { x: noteBox.x + 20, y: area.y + area.height - noteBox.height + 10 }
  await drag({ x: noteBox.x + 20, y: noteBox.y + 10 }, lowNote)
  const lowered = await note.boundingBox()
  assert.ok(lowered.y + lowered.height > (await schoolFooter.boundingBox()).y, 'note overlaps the lower gesture plane')
  await note.locator('textarea').fill('Keep this note')
  await drag(await center(note.locator('textarea')), { x: lowered.x + 5, y: lowered.y + 50 })
  assert.equal(await deck.getAttribute('data-page'), 'schoolyard', 'editing a low note owns its gesture')
  await drag({ x: lowered.x + 20, y: lowered.y + 10 }, { x: lowered.x - 90, y: lowered.y + 10 })
  assert.equal(await deck.getAttribute('data-page'), 'schoolyard', 'dragging a low note does not turn page')
  await drag({ x: lowered.x + 20, y: lowered.y + 10 }, { x: noteBox.x + 20, y: noteBox.y + 10 })
  const restoredNoteStyle = await note.getAttribute('style')
  const source = await page.locator('.paper-source').boundingBox()
  const guidance = await page.locator('.paper-guidance').boundingBox()
  assert.ok(guidance.y >= source.y + source.height, 'handwritten guidance sits below stack')
  assert.ok(guidance.x + guidance.width > source.x, 'guidance is aligned under stack')
  assert.equal(await page.locator('.paper-guidance').evaluate(el => {
    const svg = el.querySelector('svg')
    const start = new DOMPoint(70, 40).matrixTransform(svg.getScreenCTM())
    const text = el.querySelector('span').getBoundingClientRect()
    return start.x >= text.left && start.x <= text.right && start.y >= text.top && start.y <= text.bottom
  }), true, 'arrow begins in the instruction text area')
  await page.screenshot({ path: `/tmp/ilogokids-ux-${touch ? 'touch' : 'desktop'}.png` })
  await drag(origin, { x: origin.x - 110, y: origin.y })
  await page.waitForTimeout(550)
  await tabs.first().click()
  await page.waitForTimeout(550)
  assert.equal(await note.locator('textarea').inputValue(), 'Keep this note')
  assert.equal(await note.getAttribute('style'), restoredNoteStyle)
  assert.equal(await world.getAttribute('transform'), graph)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await drag(origin, { x: origin.x - 24, y: origin.y }, async () => {
    assert.equal(await currentTransform(), 'none', 'reduced motion suppresses drag lift')
  })
  await drag(origin, { x: origin.x - 110, y: origin.y })
  assert.equal(await deck.getAttribute('data-page'), 'history')
  await page.waitForTimeout(150)
  assert.equal(await deck.getAttribute('data-turn'), null)
  assert.deepEqual(errors, [])
})

for (const touch of [false, true]) test(`graph retains its gesture when crossing the lower page zone (${touch ? 'touch' : 'mouse'})`, async t => {
  const { page, center, drag, errors } = await setup(t, touch)
  const world = page.locator('.graph-world')
  const graph = await world.getAttribute('transform')
  const basket = await page.locator('.paper-trash').boundingBox()
  const root = await center(page.locator('.graph-node--root .node-body'))
  await drag(root, { x: root.x + 20, y: basket.y - 30 })
  assert.notEqual(await world.getAttribute('transform'), graph)
  assert.equal(await page.locator('.notebook-deck').getAttribute('data-page'), 'schoolyard')
  assert.equal(await page.locator('.notebook-deck').getAttribute('data-turn'), null)
  assert.deepEqual(errors, [])
})


for (const angle of [90, 270]) test(`physical balls keep their screen location at ${angle}-degree OS switches; notebook only reflows`, async t => {
  const { page, center, drag, errors } = await setup(t, true, false, trackedSensors);
  const stream = (x, y) => page.evaluate(({ x, y }) => {
    clearInterval(window.gravityStream);
    window.setPaperGravity(x, y);
    window.gravityStream = setInterval(() => window.setPaperGravity(x, y), 20);
  }, { x, y });
  await stream(0, 0);
  const area = await page.locator('.paper-drop-area').boundingBox();
  for (let i = 0; i < 3; i++) {
    await drag(await center(page.locator('.paper-source')), { x: area.x + 90 + i * 30, y: area.y + 80 + i * 130 });
    await page.locator('.paper-note textarea').fill(`Loose paper ${i}`);
    await page.locator('.paper-crumple-action').click();
    await page.locator('.paper-crumpling').waitFor({ state: 'detached' });
  }
  const snapshot = () => page.evaluate(() => {
    const deck = document.querySelector('.notebook-deck'), layer = document.querySelector('.paper-ball-layer');
    return { width: deck.offsetWidth, height: deck.offsetHeight, angle: Number(layer.dataset.screenAngle), transform: getComputedStyle(deck).transform,
      balls: [...document.querySelectorAll('.paper-ball')].map(el => {
        const matrix = new DOMMatrix(el.style.transform), rect = el.getBoundingClientRect();
        return { id: el.dataset.paperId, x: matrix.e + 19, y: matrix.f + 19, visibleX: rect.x + rect.width / 2, visibleY: rect.y + rect.height / 2 };
      }) };
  });
  const check = (from, to) => {
    assert.deepEqual(to.balls.map(ball => ball.id), from.balls.map(ball => ball.id));
    const radians = (from.angle - to.angle) * Math.PI / 180;
    for (let i = 0; i < from.balls.length; i++) {
      const point = from.balls[i], ball = to.balls[i];
      const x = point.x - from.width / 2, y = point.y - from.height / 2;
      const expectedX = Math.max(19, Math.min(to.width - 19, to.width / 2 + x * Math.cos(radians) - y * Math.sin(radians)));
      const expectedY = Math.max(19, Math.min(to.height - 19, to.height / 2 + x * Math.sin(radians) + y * Math.cos(radians)));
      near(ball.x, expectedX); near(ball.y, expectedY);
      near(ball.visibleX, ball.x); near(ball.visibleY, ball.y);
    }
  };
  const before = await snapshot();
  assert.equal(await page.locator('.notebook-camera').count(), 0);
  assert.equal(before.transform, 'none');
  await stream(0.4, 0.64);
  await page.waitForFunction(point => {
    const matrix = new DOMMatrix(document.querySelector('.paper-ball').style.transform);
    return matrix.e + 19 > point.x + 2 && matrix.f + 19 > point.y + 2;
  }, before.balls[0], { timeout: 1500 });
  const tilted = await snapshot();
  assert.deepEqual([tilted.width, tilted.height, tilted.transform], [393, 852, 'none']);
  assert.ok(tilted.balls[0].x > before.balls[0].x + 2 && tilted.balls[0].y > before.balls[0].y + 2, 'tilt acts on balls only');
  await stream(0, 1);
  await page.waitForTimeout(2600);
  assert.ok((await snapshot()).balls.every(ball => ball.y > 852 * 0.85));
  // Hold the phone flat for a deterministic coordinate comparison. The unit
  // regressions prove velocity preservation without relying on animation timing.
  await stream(0, 0);
  await page.waitForTimeout(650);
  const resting = await snapshot();
  await page.evaluate(angle => window.setScreenBasis(angle), angle);
  const pending = await snapshot();
  assert.equal(pending.angle, 0, 'angle-first callback waits for actual viewport dimensions');
  await page.setViewportSize({ width: 852, height: 393 });
  await page.waitForFunction(angle => Number(document.querySelector('.paper-ball-layer').dataset.screenAngle) === angle, angle);
  const landscape = await snapshot();
  assert.deepEqual([landscape.width, landscape.height, landscape.transform], [852, 393, 'none']);
  check(resting, landscape);
  assert.ok(landscape.balls.every(ball => angle === 90 ? ball.x > 852 - 25 : ball.x < 25), 'old portrait bottom becomes the corresponding SIDE');
  await page.screenshot({ path: `/tmp/ilogokids-physical-side-${angle}.png` });
  await stream(angle === 90 ? -1 : 1, 0);
  await page.waitForTimeout(200);
  const falling = await snapshot();
  assert.ok(falling.balls.some((ball, i) => ball.y > landscape.balls[i].y + 2), 'real gravity pulls balls from the side toward the new bottom');
  await page.waitForTimeout(2400);
  assert.ok((await snapshot()).balls.every(ball => ball.y > 393 * 0.7));
  await stream(0, 0);
  await page.waitForTimeout(650);
  const fromLandscape = await snapshot();

  // Reverse order: layout first; do not apply an intermediate clamp/normalization.
  await page.setViewportSize({ width: 393, height: 852 });
  assert.equal((await snapshot()).angle, angle);
  await page.evaluate(() => window.setScreenBasis(0));
  await page.waitForFunction(() => document.querySelector('.paper-ball-layer').dataset.screenAngle === '0');
  const portrait = await snapshot();
  assert.deepEqual([portrait.width, portrait.height, portrait.transform], [393, 852, 'none']);
  check(fromLandscape, portrait);
  assert.equal(await page.locator('.paper-ball').count(), 3);
  assert.equal(await page.evaluate(() => window.sensorListenerCount()), 2);
  await page.screenshot({ path: `/tmp/ilogokids-physical-return-${angle}.png` });
  await page.getByRole('button', { name: 'Abmelden', exact: true }).click();
  await page.locator('#login-nick').waitFor();
  assert.equal(await page.evaluate(() => window.sensorListenerCount()), 0);
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(() => window.pendingFrameCount()), 0);
  await page.evaluate(() => clearInterval(window.gravityStream));
  assert.deepEqual(errors, []);
});
