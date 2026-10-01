// Run against local Vite with PLAYWRIGHT_MODULE_PATH set when Playwright is
// supplied by the workspace runtime. API fixtures never contact the backend.
const test = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const url = process.env.NOTEBOOK_TEST_URL || 'http://127.0.0.1:5173'
const near = (a, b) => assert.ok(Math.abs(a - b) < 1, `${a} differs from ${b}`)

async function setup(t, touch, mockKeyboard = false) {
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: touch ? { width: 393, height: 852 } : { width: 1440, height: 900 }, isMobile: touch, hasTouch: touch })
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
  await page.locator('.notebook-sheet.is-current .notebook-tabs button').nth(1).click()
  assert.equal(await page.locator('.notebook-deck').getAttribute('data-page'), 'history')
  assert.equal(await page.locator('#schoolyard-sheet').getAttribute('inert'), '')
  await page.locator('#history-sheet h2').waitFor({ state: 'visible' })
  await page.locator('.notebook-sheet.is-current .notebook-tabs button').first().click()
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
    await page.locator('.notebook-sheet.is-current .notebook-tabs button').nth(1).focus()
    await page.keyboard.press('Enter')
  })
  assert.equal(await page.locator('.notebook-deck').getAttribute('data-page'), 'history')
  assert.equal(await note.count(), 1, 'page switch cancels an unfinished source')

  await page.locator('.notebook-sheet.is-current .notebook-tabs button').nth(1).click()
  await page.locator('.notebook-sheet.is-current .notebook-tabs button').first().click()
  await page.waitForTimeout(550)
  assert.equal(await note.count(), 1)
  assert.equal(await world.getAttribute('transform'), graph)
  assert.equal(await note.locator('textarea').inputValue(), 'A local school note');
  if (touch) {
    await note.locator('textarea').focus();
    const geometry = () => page.evaluate(() => {
      const selectors = ['.notebook-deck', '#schoolyard-sheet', '#schoolyard-sheet .app-header', '.graph-scene', '.paper-note:not(.paper-draft)', '.paper-trash', '.paper-stack', '#schoolyard-sheet .notebook-tabs'];
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
  assert.equal(await page.locator('.notebook-sheet.is-current .notebook-tabs button').nth(1).textContent(), 'History')
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


test('page turn uses perspective and respects reduced motion without changing graph state', async t => {
  const { page } = await setup(t, false)
  const original = await page.locator('.graph-world').getAttribute('transform')
  await page.locator('.notebook-sheet.is-current .notebook-tabs button').nth(1).click()
  const leaf = page.locator('#schoolyard-sheet.turn-forward');
  assert.equal(await leaf.evaluate(el=>getComputedStyle(el).animationName), 'sheet-forward');
  assert.equal(await leaf.locator('.app-header .wordmark').count(), 1);
  assert.equal(await leaf.locator('.paper-stack').count(), 1);
  assert.equal(await page.locator('#history-sheet .app-header .wordmark').count(), 1);
  assert.equal(await page.locator('.notebook-page > .app-header').count(), 0);
  await page.waitForTimeout(180);
  assert.notEqual(await leaf.evaluate(el=>getComputedStyle(el).transform), 'none');
  await page.waitForTimeout(550)
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.locator('.notebook-sheet.is-current .notebook-tabs button').first().click()
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
    objects: [...document.querySelectorAll('#schoolyard-sheet, #schoolyard-sheet .app-header, .paper-note:not(.paper-draft), .paper-trash, .paper-stack, #schoolyard-sheet .notebook-tabs')].map(el => {
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
  await page.locator('#schoolyard-sheet .notebook-tabs button').nth(1).click();
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
