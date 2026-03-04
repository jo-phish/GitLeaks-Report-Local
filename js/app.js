/* Viewer: reads multiple JSON files and renders a table using keys:
   RuleId, Description, Secret, Line, Date, Message, Meta
   Accepts arrays, single object, NDJSON; tolerant to common casing differences. */

(() => {
  const input = document.getElementById('fileInput');
  const clearBtn = document.getElementById('clearBtn');
  const tableSection = document.getElementById('tableSection');
  const tbody = document.querySelector('#resultsTable tbody');
  const summary = document.getElementById('summary');
  const errorsEl = document.getElementById('errors');

  let items = [];

  input.addEventListener('change', handleFiles);
  clearBtn.addEventListener('click', clearAll);

  function setError(msg = '') {
    errorsEl.textContent = msg;
  }

  function clearAll() {
    items = [];
    tbody.innerHTML = '';
    tableSection.classList.add('hidden');
    summary.textContent = 'No files loaded';
    input.value = '';
    setError();
  }

  async function handleFiles(ev) {
    setError();
    const files = Array.from(ev.target.files || []);
    if (!files.length) return;
    summary.textContent = `${files.length} file(s) selected`;

    const parsed = [];
    for (const f of files) {
      try {
        const txt = await f.text();
        parsed.push(...parsePossibleJson(txt));
      } catch (err) {
        setError(`Failed to read ${f.name}: ${err && err.message ? err.message : err}`);
      }
    }

    if (!parsed.length) {
      setError('No items found in selected files.');
      return;
    }

    items = items.concat(parsed);
    render(items);
  }

  function parsePossibleJson(text) {
    text = (text || '').trim();
    if (!text) return [];

    // try full JSON parse
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') {
        // common wrappers
        if (Array.isArray(parsed.findings)) return parsed.findings;
        if (Array.isArray(parsed.results)) return parsed.results;
        if (Array.isArray(parsed.leaks)) return parsed.leaks;
        // return single object as array
        return [parsed];
      }
    } catch {
      // fall through to NDJSON
    }

    // try NDJSON (one JSON per line)
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const objs = [];
    for (const l of lines) {
      try {
        const o = JSON.parse(l);
        if (o && typeof o === 'object') objs.push(o);
      } catch {
        // ignore non-json lines
      }
    }
    return objs;
  }

  // map item to required output fields with tolerant key lookups
  function extractRow(item) {
    if (!item || typeof item !== 'object') return {};
    const get = (...names) => {
      for (const n of names) {
        if (n in item && item[n] !== null && item[n] !== undefined) return item[n];
      }
      return '';
    };

    const RuleId = get('RuleId', 'RuleID', 'ruleId', 'rule_id', 'rule');
    const Description = get('Description', 'description', 'rule_description', 'ruleDescription');
    const Secret = get('Secret', 'Match', 'match', 'offender', 'secret');
    // Line: prefer full line text if available, otherwise StartLine number
    const Line = get('Line', 'line', 'LineText') || (get('StartLine', 'startLine', 'start_line') ? String(get('StartLine', 'startLine', 'start_line')) : '');
    const Date = get('Date', 'date', 'CommitDate', 'timestamp');
    const Message = get('Message', 'message');
    const Link = get('Link', 'link', 'URL', 'url');
    const File = get('File', 'file', 'Filename', 'filename');

    // Meta fields: Author, Email, StartLine, EndLine
    const Author = get('Author', 'author');
    const Email = get('Email', 'email');
    const StartLine = get('StartLine', 'startLine', 'start_line') || (item.StartLine ? String(item.StartLine) : '');
    const EndLine = get('EndLine', 'endLine', 'end_line') || (item.EndLine ? String(item.EndLine) : '');

    return { RuleId, Description, Secret, Line, Date, Message, Link, File, Author, Email, StartLine, EndLine };
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function render(list) {
    tbody.innerHTML = '';

    // Number of columns in the header (RuleId, Description, Secret, Line, Date, Message, Meta)
    const headerColCount = 7;

    for (const it of list) {
      const row = extractRow(it);

      // Main row (all fields except Meta content is in the last column)
      const tr = document.createElement('tr');

      // RuleId
      const tdRule = document.createElement('td');
      tdRule.textContent = row.RuleId || '';
      tr.appendChild(tdRule);

      // Description
      const tdDesc = document.createElement('td');
      tdDesc.textContent = row.Description || '';
      tr.appendChild(tdDesc);

      // Secret
      const tdSecret = document.createElement('td');
      if (row.Secret) {
        const pre = document.createElement('pre');
        pre.textContent = row.Secret;
        tdSecret.appendChild(pre);
      } else {
        tdSecret.textContent = '';
      }
      tr.appendChild(tdSecret);

      // Line
      const tdLine = document.createElement('td');
      if (row.Line) {
        const pre = document.createElement('pre');
        pre.textContent = row.Line;
        tdLine.appendChild(pre);
      } else {
        tdLine.textContent = '';
      }
      tr.appendChild(tdLine);

      // Date
      const tdDate = document.createElement('td');
      tdDate.textContent = row.Date || '';
      tr.appendChild(tdDate);

      // Message
      const tdMsg = document.createElement('td');
      tdMsg.textContent = row.Message || '';
      tr.appendChild(tdMsg);

      // Meta column (Author, Email, StartLine-EndLine)
      const tdMeta = document.createElement('td');
      const metaParts = [];
      if (row.Author) metaParts.push(`Author: ${row.Author}`);
      if (row.Email) metaParts.push(`Email: ${row.Email}`);
      if (row.StartLine || row.EndLine) {
        const start = row.StartLine || '';
        const end = row.EndLine || '';
        const lines = start && end ? `${start} - ${end}` : (start || end);
        metaParts.push(`Lines: ${lines}`);
      }
      if (metaParts.length) {
        metaParts.forEach(p => {
          const div = document.createElement('div');
          div.textContent = p;
          tdMeta.appendChild(div);
        });
      } else {
        tdMeta.textContent = '';
      }
      tr.appendChild(tdMeta);

      tbody.appendChild(tr);

      // Subrow for File (placed immediately below main row, above Link subrow)
      const trFileSub = document.createElement('tr');
      const tdFileSub = document.createElement('td');
      tdFileSub.colSpan = headerColCount;

      if (row.File) {
        const label = document.createElement('strong');
        label.textContent = 'File: ';
        const code = document.createElement('code');
        code.textContent = row.File;
        tdFileSub.appendChild(label);
        tdFileSub.appendChild(code);
      } else {
        tdFileSub.textContent = '';
      }

      trFileSub.appendChild(tdFileSub);
      tbody.appendChild(trFileSub);

      // Subrow for Link (placed immediately below File subrow, spanning all header columns)
      const trLinkSub = document.createElement('tr');
      const tdLinkSub = document.createElement('td');
      tdLinkSub.colSpan = headerColCount;

      if (row.Link) {
        const label = document.createElement('strong');
        label.textContent = 'Link: ';
        const a = document.createElement('a');
        a.href = row.Link;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = row.Link;
        tdLinkSub.appendChild(label);
        tdLinkSub.appendChild(a);
      } else {
        tdLinkSub.textContent = '';
      }

      trLinkSub.appendChild(tdLinkSub);
      tbody.appendChild(trLinkSub);
    }

    tableSection.classList.remove('hidden');
    summary.textContent = `${list.length} total item(s)`;
  }

})();