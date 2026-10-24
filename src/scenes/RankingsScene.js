import Phaser from 'phaser';
import { RANKINGS, UI_KIT } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { applyRenderScale, fillView } from '../display.js';
import {
  boards, cleanCode, online, rankingsHost,
} from '../online/index.js';
import { Button } from '../ui/Button.js';
import { CaptainNameDialog } from '../ui/CaptainNameDialog.js';
import { formatNum } from '../ui/format.js';
import { HtmlField } from '../ui/HtmlField.js';
import {
  dark, glyph, hexColor, icon, panel, subText, tapArea, text, UI,
} from '../ui/kit.js';

const MEDALS = ['medal_gold', 'medal_silver', 'medal_bronze'];
const R = RANKINGS;

// The time of day (and the date once it isn't today).
function timeLabel(at, now = Date.now()) {
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (new Date(now).toDateString() === d.toDateString() ? time : `${d.toLocaleDateString()} ${time}`).toUpperCase();
}

// "JUST NOW" / "3 MIN AGO", then the time.
function whenLabel(at, now = Date.now()) {
  const min = Math.floor((now - at) / 60000);
  if (min < 1) return 'JUST NOW';
  if (min < 60) return `${min} MIN AGO`;
  return timeLabel(at, now);
}

// Rankings (the Abyss card's trophy, the Captain's Log's Rankings tab),
// after preview_rankings_world.png / _crew.png: a parchment panel with the
// trophy, "DEEPEST ABYSS DEPTH", World and Crew tabs and refresh.
//   World: the top RANKINGS.worldLimit by best depth, medals for 1-3, the
//     player's row in gold; "YOU: #N OF T CAPTAINS" under it, and their own
//     row pinned under the list when they aren't in it.
//   Crew: the player's crew code (Copy), a friend's code field (Add), then
//     the player and their crew. Holding a crewmate's row (or its x, on
//     hover) asks, in the row, to remove them.
// Each board is fetched at most every RANKINGS.refreshMs (boards.js);
// offline, or when a call fails, the last one fetched is shown with the
// offline icon and when it's from.
// Without the env keys it only says "Rankings aren't set up yet." The first
// time (nothing sent before this), and when this device has no captain
// (an imported save), it asks the player to join first.
// Launched with { progress, onClose }.
export class RankingsScene extends Phaser.Scene {
  constructor() {
    super('RankingsScene');
    this.tab = 'world';   // kept between openings
  }

  init({ progress, onClose }) {
    this.progress = progress;
    this.onClose = onClose;
    this.offset = 0;
    this.confirming = null;   // the crewmate whose row asks to remove them
    this.message = null;      // the Crew tab's last Add / Copy result
  }

  get record() { return this.progress.online; }

  create() {
    applyRenderScale(this);
    fillView(this, 0x0d1117, 0.75);
    this.root = this.add.container(0, 0);
    const { width: W, height: H } = R.panel;
    const center = (view) => {
      this.root.setPosition(Math.round(view.centerX - W / 2), Math.round(view.centerY - H / 2));
      this.field?.place();
      this.codeField?.place();
    };
    center(this.view);
    this.events.on('view-resize', center);
    this.events.once('shutdown', () => this.events.off('view-resize', center));

    if (!online.available) {
      this.showUnavailable();
      return;
    }
    if (!this.record.joined) {
      this.askToJoin();
      return;
    }
    this.showBoards();
    // A save that joined on another device (imported) has no session here.
    online.hasSession().then((has) => {
      if (!has && this.scene.isActive()) this.askToJoin({ again: true });
    });
  }

  // --- Not set up / joining ---

  showUnavailable() {
    const { width: W } = R.panel;
    const h = 64;
    const y = (R.panel.height - h) / 2;
    this.root.add([
      panel(this, 40, y, W - 80, h, 'parchment'),
      icon(this, W / 2, y + 16, 'trophy'),
      text(this, W / 2, y + 32, "Rankings aren't set up yet.", dark()).setOrigin(0.5),
      new Button(this, W / 2, y + h - 2, {
        width: 70, height: 18, style: 'gold', label: 'Close', onClick: () => this.close(),
      }),
    ]);
  }

  askToJoin({ again = false } = {}) {
    if (this.joinDialog?.scene) return;   // already asking
    this.root.setVisible(false);
    this.field?.setVisible(false);
    this.joinDialog = new CaptainNameDialog(this, {
      title: 'Join the Rankings?',
      message: again
        ? 'This device has no captain yet. Pick a name to join again.'
        : 'Pick a captain name. Other players will see it next to your best Abyss depth.',
      value: this.record.name,
      onSubmit: async (name) => {
        const me = await online.join(name);
        Object.assign(this.record, {
          joined: true, name: me.name, code: me.code, lastSubmittedDepth: me.best, world: null, crew: null,
        });
        rankingsHost.joined();
        if (!this.scene.isActive()) return;
        this.root.setVisible(true);
        this.showBoards();
      },
      onCancel: () => this.close(),
    });
  }

  // --- The boards ---

  showBoards() {
    const { width: W, height: H } = R.panel;
    this.root.removeAll(true);
    this.field?.destroy();
    this.field = null;
    this.root.add(panel(this, 0, 0, W, H, 'parchment'));
    const trophy = icon(this, 16, R.titleY, 'trophy');
    const title = text(this, 25, R.titleY, 'RANKINGS', dark()).setOrigin(0, 0.5);
    const depthX = title.anchorX + title.inkWidth + 16;
    this.root.add([
      trophy, title,
      icon(this, depthX, R.titleY, 'anchor_depth'),
      text(this, depthX + 9, R.titleY, 'DEEPEST ABYSS DEPTH', subText()).setOrigin(0, 0.5),
      new Button(this, W - 16, R.titleY, {
        width: 20, height: 16, font: 'small', label: 'X', onClick: () => this.close(),
      }),
    ]);
    this.tabs = this.add.container(0, 0);
    this.refresh = tapArea(icon(this, W - 16, R.tabsY, 'refresh'), 12, 12, { useHandCursor: true });
    this.refresh.on('pointerdown', () => this.fetchBoard({ manual: true }));
    // The refresh icon's own tint is light (for wood): on parchment it's
    // drawn in the text colour.
    this.refresh.setTint(hexColor(UI.colors.textOnParchment));
    this.body = this.add.container(0, 0);
    this.footer = this.add.container(0, 0);
    this.root.add([this.tabs, this.refresh, this.body, this.footer]);

    // The list scrolls by wheel or drag.
    const onWheel = (_p, _over, _dx, dy) => this.scroll(Math.sign(dy));
    this.input.on('wheel', onWheel);
    let dragFrom = null;
    const onDown = (p) => {
      dragFrom = { y: p.y, offset: this.offset };
      this.dragged = false;
    };
    const onMove = (p) => {
      if (!dragFrom || !p.isDown) return;
      const rows = Math.round((dragFrom.y - p.y) / R.rowHeight);
      if (rows) this.dragged = true;
      this.scrollTo(dragFrom.offset + rows);
    };
    const onUp = () => { dragFrom = null; };
    this.input.on('pointerdown', onDown);
    this.input.on('pointermove', onMove);
    this.input.on('pointerup', onUp);
    this.events.once('shutdown', () => {
      this.input.off('wheel', onWheel);
      this.input.off('pointerdown', onDown);
      this.input.off('pointermove', onMove);
      this.input.off('pointerup', onUp);
    });
    this.selectTab(this.tab, { quiet: true });
  }

  drawTabs() {
    this.tabs.removeAll(true);
    [['world', 'WORLD'], ['crew', 'CREW']].forEach(([key, label], i) => {
      this.tabs.add(new Button(this, 12 + R.tab.width / 2 + i * (R.tab.width + 6), R.tabsY, {
        width: R.tab.width, height: R.tab.height, font: 'small', label,
        style: key === this.tab ? 'gold' : 'wood', onClick: () => this.selectTab(key),
      }));
    });
  }

  selectTab(tab, { quiet = false } = {}) {
    if (!quiet && tab === this.tab) return;
    if (!quiet) sfx.play('ui_click');
    this.tab = tab;
    this.offset = 0;
    this.confirming = null;
    this.message = null;
    this.drawTabs();
    this.result = { board: this.record[tab], status: 'loading' };
    this.draw();
    this.fetchBoard();
  }

  // Fetch the open tab (boards.load: at most every refreshMs); manual: the
  // refresh icon, which does nothing until it may.
  async fetchBoard({ manual = false, force = false } = {}) {
    const tab = this.tab;
    if (manual) {
      if (boards.refreshIn(tab) > 0) {
        sfx.play('ui_error');
        return;
      }
      sfx.play('ui_click');
    }
    if (this.result?.board == null || manual || force) this.result = { board: this.record[tab], status: 'loading' };
    this.draw();
    const result = await boards.load(tab, { force });
    if (!this.scene.isActive() || tab !== this.tab) return;
    if (result.status === 'join') {
      this.askToJoin({ again: true });
      return;
    }
    this.result = result;
    this.draw();
  }

  // The refresh icon dims until the tab may be fetched again.
  paintRefresh() {
    const wait = boards.refreshIn(this.tab);
    this.refresh.setAlpha(wait > 0 ? 0.35 : 1);
    this.refreshTimer?.remove();
    if (wait > 0) this.refreshTimer = this.time.delayedCall(wait + 50, () => this.paintRefresh());
  }

  draw() {
    this.body.removeAll(true);
    this.footer.removeAll(true);
    this.codeField?.destroy();
    this.codeField = null;
    if (this.tab === 'world') this.drawWorld();
    else this.drawCrew();
    this.drawFooter();
    this.paintRefresh();
  }

  // --- World ---

  drawWorld() {
    const board = this.result.board;
    this.list = { top: R.rowsY, rows: board?.rows ?? [], pinned: null };
    const me = board?.me;
    if (me && !this.list.rows.some((r) => r.me)) {
      this.list.pinned = { rank: me.rank, name: this.record.name, best: me.best, me: true };
    }
    this.drawList();
  }

  // --- Crew ---

  drawCrew() {
    const { width: W } = R.panel;
    const { y, height } = R.codeBox;
    const code = this.record.code || '------';
    const copy = new Button(this, W - 44, y + height / 2, {
      width: 56, height: 18, font: 'small', icon: 'copy', label: 'COPY', onClick: () => this.copyCode(),
    });
    copy.setEnabled(!!this.record.code);
    this.body.add([
      this.add.rectangle(12, y, W - 24, height, hexColor(R.boxColor)).setOrigin(0),
      icon(this, 24, y + height / 2, 'crew_friends'),
      text(this, 35, y + 8, 'YOUR CREW CODE', subText()).setOrigin(0, 0.5),
      this.codeText = text(this, 35, y + 19, code, dark()).setOrigin(0, 0.5),
      copy,
    ]);
    const { addWidth, y: fy, height: fh } = R.field;
    const fieldW = W - 24 - addWidth - 6;
    if (!this.field) {
      this.field = new HtmlField(this, {
        box: () => ({ x: this.root.x + 12, y: this.root.y + fy, w: fieldW, h: fh }),
        placeholder: "FRIEND'S CODE",
        maxLength: R.codeLength + 2,
        upper: true,
        onEnter: () => this.addFriend(),
      });
    }
    this.field.setVisible(true);
    this.body.add(new Button(this, W - 12 - addWidth / 2, fy + fh / 2, {
      width: addWidth, height: fh + 2, font: 'small', style: 'gold', label: 'ADD', onClick: () => this.addFriend(),
    }));
    this.list = { top: R.crewRowsY, rows: this.result.board?.rows ?? [], pinned: null };
    this.drawList();
  }

  // The Clipboard API, else the old copy command on the code put in a
  // selected field over it (some phones only allow either from a tap);
  // failing both, the field stays there, selected, to copy by hand.
  copyCode() {
    const code = this.record.code;
    const done = (str) => {
      this.message = str;
      this.drawFooter();
    };
    const fallback = () => {
      const t = this.codeText;
      this.codeField?.destroy();
      this.codeField = new HtmlField(this, {
        box: () => ({ x: this.root.x + t.anchorX - 2, y: this.root.y + R.codeBox.y + 11, w: 70, h: 16 }),
        value: code,
      });
      const input = this.codeField.focus().input;
      input.readOnly = true;
      input.select();
      input.setSelectionRange(0, code.length);
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { /* not allowed */ }
      done(ok ? 'COPIED YOUR CREW CODE!' : 'SELECT YOUR CODE ABOVE AND COPY IT.');
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(code).then(() => done('COPIED YOUR CREW CODE!'), fallback);
    else fallback();
  }

  async addFriend() {
    if (this.adding) return;
    const code = cleanCode(this.field?.value);
    if (!code) {
      sfx.play('ui_error');
      this.message = `CREW CODES ARE ${R.codeLength} LETTERS AND NUMBERS.`;
      this.drawFooter();
      return;
    }
    this.adding = true;
    this.message = 'SIGNALLING...';
    this.drawFooter();
    try {
      const friend = await online.addFriend(code);
      if (!this.scene.isActive()) return;
      sfx.play('ui_open');
      this.field?.setValue('');
      this.message = `${friend.name} joined your crew!`;
      await this.fetchBoard({ force: true });
    } catch (err) {
      if (!this.scene.isActive()) return;
      sfx.play('ui_error');
      if (err.kind === 'auth') {
        this.askToJoin({ again: true });
        return;
      }
      this.message = err.kind === 'server' ? err.message : "Can't reach port. Try again later.";
      this.drawFooter();
    } finally {
      this.adding = false;
    }
  }

  async removeFriend(row) {
    this.confirming = null;
    this.message = `${row.name} left your crew.`;
    try {
      await online.removeFriend(row.id);
      if (this.scene.isActive()) await this.fetchBoard({ force: true });
    } catch (err) {
      if (!this.scene.isActive()) return;
      sfx.play('ui_error');
      this.message = err.kind === 'server' ? err.message : "Can't reach port. Try again later.";
      this.draw();
    }
  }

  // --- The list ---

  get visibleRows() {
    const room = Math.floor((R.footerY - 2 - this.list.top) / R.rowHeight);
    return this.list.pinned ? room - 1 : room;
  }

  get maxOffset() { return Math.max(0, this.list.rows.length - this.visibleRows); }

  scroll(by) { this.scrollTo(this.offset + by); }

  scrollTo(offset) {
    const next = Phaser.Math.Clamp(offset, 0, this.maxOffset);
    if (next === this.offset || !this.list) return;
    this.offset = next;
    this.confirming = null;
    this.draw();
  }

  drawList() {
    const { width: W } = R.panel;
    const { rows, top, pinned } = this.list;
    if (!rows.length && !pinned) {
      const empty = this.result.status === 'loading' ? 'HAULING IN THE CHARTS...'
        : this.tab === 'world' ? 'NO CAPTAINS HAVE DIVED YET.' : 'YOUR CREW IS JUST YOU. ADD A FRIEND!';
      if (this.result.status !== 'offline' || this.result.board) {
        this.body.add(text(this, W / 2, top + 40, empty, subText()).setOrigin(0.5));
      }
      return;
    }
    this.offset = Math.min(this.offset, this.maxOffset);
    const shown = rows.slice(this.offset, this.offset + this.visibleRows);
    shown.forEach((row, i) => this.body.add(this.rowAt(row, top + i * R.rowHeight)));
    if (pinned) {
      const y = top + this.visibleRows * R.rowHeight;
      this.body.add(text(this, W / 2, y - 1, '. . .', subText()).setOrigin(0.5, 0.5));
      this.body.add(this.rowAt(pinned, y + 2));
    }
    // A thin scrollbar inside the right edge.
    if (this.maxOffset > 0) {
      const trackH = this.visibleRows * R.rowHeight;
      const barH = Math.max(8, Math.round(trackH * this.visibleRows / rows.length));
      const barY = top + Math.round((trackH - barH) * this.offset / this.maxOffset);
      this.body.add(this.add.rectangle(W - 5, barY, 2, barH, hexColor(UI.colors.subText)).setOrigin(0));
    }
  }

  // A row: medal (or rank), name and best depth; the player's own in gold.
  // A crewmate's row can be held (or its x tapped) to remove them.
  rowAt(row, y) {
    const { width: W } = R.panel;
    const h = R.rowHeight;
    const c = this.add.container(0, y);
    // (Hidden by its fill, not its alpha: Phaser doesn't hit-test what
    // won't render.)
    const bg = this.add.rectangle(6, 0, W - 12, h - 1, hexColor(row.me ? R.meColor : R.pressColor), row.me ? 1 : 0)
      .setOrigin(0);
    c.add(bg);
    if (this.confirming && this.confirming.id === row.id && !row.me) {
      bg.setFillStyle(hexColor(R.pressColor), 1);
      c.add([
        text(this, 14, h / 2, `Remove ${row.name}?`, dark()).setOrigin(0, 0.5),
        new Button(this, W - 108, h / 2, {
          width: 44, height: 15, font: 'small', label: 'NO',
          onClick: () => { this.confirming = null; this.draw(); },
        }),
        new Button(this, W - 50, h / 2, {
          width: 64, height: 15, font: 'small', style: 'gold', label: 'REMOVE', onClick: () => this.removeFriend(row),
        }),
      ]);
      return c;
    }
    c.add(row.rank <= 3 && row.rank >= 1
      ? icon(this, 16, h / 2, MEDALS[row.rank - 1])
      : text(this, 16, h / 2 + 1, `${row.rank}`, subText()).setOrigin(0.5));
    c.add(text(this, 27, h / 2, row.name, dark()).setOrigin(0, 0.5));
    c.add(text(this, W - 14, h / 2, formatNum(row.best), dark()).setOrigin(1, 0.5));
    if (this.tab === 'crew' && !row.me && row.id) this.removable(c, bg, row);
    return c;
  }

  // Hover shows an x left of the depth; holding the row RANKINGS.longPressMs
  // (a touch) asks too.
  removable(c, bg, row) {
    const { width: W } = R.panel;
    const h = R.rowHeight;
    const ask = () => {
      sfx.play('ui_click');
      this.confirming = row;
      this.draw();
    };
    // (The x isn't interactive itself: the row takes taps on its spot.)
    const xAt = W - 52;
    const x = glyph(this, xAt, h / 2, 'cross', R.removeColor).setVisible(false);
    c.add(x);
    bg.setInteractive({ useHandCursor: true });
    let hold = null;
    const cancel = () => { hold?.remove(); hold = null; bg.setFillStyle(hexColor(R.pressColor), 0); };
    bg.on('pointerover', () => x.setVisible(true));
    bg.on('pointerout', () => { cancel(); x.setVisible(false); });
    bg.on('pointerdown', (_p, localX) => {
      if (Math.abs(bg.x + localX - xAt) <= R.rowHeight / 2) {
        ask();
        return;
      }
      bg.setFillStyle(hexColor(R.pressColor), 0.6);
      hold = this.time.delayedCall(R.longPressMs, () => {
        hold = null;
        if (!this.dragged) ask();
      });
    });
    bg.on('pointerup', cancel);
  }

  // --- Footer ---

  // Under the divider: the World tab's "YOU: #N OF T CAPTAINS" (or the Crew
  // tab's last message, or its size) and when the board is from; offline,
  // a second line says so.
  drawFooter() {
    const { width: W } = R.panel;
    this.footer.removeAll(true);
    this.footer.add(this.add.rectangle(12, R.footerY, W - 24, 1, hexColor(UI_KIT.dividerColor)).setOrigin(0));
    const y1 = R.footerY + 9;
    const { board, status } = this.result;
    let left = '';
    if (this.tab === 'world') {
      const me = board?.me;
      if (me) left = `YOU: #${formatNum(me.rank)} OF ${formatNum(me.total)} CAPTAIN${me.total === 1 ? '' : 'S'}`;
      else if (board) left = 'DIVE INTO THE ABYSS TO GET A RANK';
    } else if (this.message) {
      left = this.message.toUpperCase();
    } else if (board) {
      const n = board.rows.filter((r) => !r.me).length;
      left = `${n} IN YOUR CREW`;
    }
    if (left) this.footer.add(text(this, 14, y1, left, subText()).setOrigin(0, 0.5));
    let right = '';
    if (status === 'loading') right = 'FETCHING...';
    else if (status === 'fresh' && board) right = `UPDATED ${whenLabel(board.at)}`;
    if (right && !(this.tab === 'crew' && this.message)) this.footer.add(text(this, W - 14, y1, right, subText()).setOrigin(1, 0.5));
    if (status === 'offline') {
      const note = board
        ? `CAN'T REACH PORT. SHOWING RESULTS FROM ${timeLabel(board.at)}.`
        : "CAN'T REACH PORT. NO RESULTS SAVED YET.";
      this.footer.add([
        icon(this, 19, y1 + 11, 'offline'),
        text(this, 28, y1 + 11, note, subText()).setOrigin(0, 0.5),
      ]);
    }
  }

  close() {
    sfx.play('ui_back');
    this.field?.destroy();
    this.codeField?.destroy();
    this.scene.stop();
    this.onClose?.();
  }
}
