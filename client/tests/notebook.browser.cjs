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
  const cdp = touch ? await page.context().newCDPSession(page) : null
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
  return { page, errors, requests, center, drag, sendTouch }
}

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

test('production tilt moves balls without rotating the notebook; discrete viewport switches preserve bottom balls', async t => {
  const { page, center, drag, errors } = await setup(t, true, false, trackedSensors);
  await page.evaluate(() => window.setPaperGravity(0, 0));
  const area = await page.locator('.paper-drop-area').boundingBox();
  for (let i = 0; i < 3; i++) {
    await drag(await center(page.locator('.paper-source')), { x: area.x + 90 + i * 20, y: area.y + 80 + i * 130 });
    await page.locator('.paper-note textarea').fill(`Production paper ${i}`);
    await page.locator('.paper-crumple-action').click();
    await page.locator('.paper-crumpling').waitFor({ state: 'detached' });
  }
  const snapshot = () => page.evaluate(() => {
    const deck = document.querySelector('.notebook-deck');
    return { width: deck.offsetWidth, height: deck.offsetHeight, transform: getComputedStyle(deck).transform,
      balls: [...document.querySelectorAll('.paper-ball')].map(el => {
        const matrix = new DOMMatrix(el.style.transform);
        return { id: el.dataset.paperId, x: matrix.e + 19, y: matrix.f + 19 };
      }) };
  });
  const before = await snapshot(), ids = before.balls.map(ball => ball.id);
  assert.equal(await page.locator('.notebook-camera').count(), 0);
  assert.equal(before.transform, 'none');
  await page.evaluate(() => {
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 45, beta: 40, gamma: 30 }));
    window.setPaperGravity(0.4, 0.64);
  });
  await page.waitForTimeout(180);
  const tilted = await snapshot();
  assert.deepEqual([tilted.width, tilted.height, tilted.transform], [393, 852, 'none']);
  assert.ok(tilted.balls[0].x > before.balls[0].x + 2 && tilted.balls[0].y > before.balls[0].y + 2, 'tilt acts on balls only');
  await page.evaluate(() => window.setPaperGravity(0, 1));
  await page.waitForTimeout(2600);
  assert.ok((await snapshot()).balls.every(ball => ball.y > 852 * 0.85));

  // OS angle first, then native layout resize. No camera is involved.
  await page.evaluate(() => { window.setScreenBasis(90); window.setPaperGravity(-1, 0); });
  await page.setViewportSize({ width: 852, height: 393 });
  await page.waitForFunction(() => document.querySelector('.notebook-deck').offsetWidth === 852);
  const landscape = await snapshot();
  assert.deepEqual([landscape.width, landscape.height, landscape.transform], [852, 393, 'none']);
  assert.deepEqual(landscape.balls.map(ball => ball.id), ids);
  assert.ok(landscape.balls.every(ball => ball.y > landscape.height * 0.8), 'portrait bottom stays below after landscape rebase');
  await page.waitForTimeout(180);
  assert.ok((await snapshot()).balls.every(ball => ball.y > 393 * 0.8));
  await page.screenshot({ path: '/tmp/ilogokids-production-landscape.png' });

  // Reverse event order: viewport first, then the real OS basis.
  await page.setViewportSize({ width: 393, height: 852 });
  await page.evaluate(() => { window.setScreenBasis(0); window.setPaperGravity(0, 1); });
  await page.waitForFunction(() => document.querySelector('.notebook-deck').offsetHeight === 852);
  const portrait = await snapshot();
  assert.deepEqual([portrait.width, portrait.height, portrait.transform], [393, 852, 'none']);
  assert.deepEqual(portrait.balls.map(ball => ball.id), ids);
  assert.ok(portrait.balls.every(ball => ball.y > portrait.height * 0.8), 'landscape bottom stays below after portrait rebase');
  assert.equal(await page.locator('.paper-ball').count(), 3);
  assert.equal(await page.evaluate(() => window.sensorListenerCount()), 2);
  await page.screenshot({ path: '/tmp/ilogokids-production-portrait.png' });
  await page.getByRole('button', { name: 'Abmelden', exact: true }).click();
  await page.locator('#login-nick').waitFor();
  assert.equal(await page.evaluate(() => window.sensorListenerCount()), 0);
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(() => window.pendingFrameCount()), 0);
  assert.deepEqual(errors, []);
});
