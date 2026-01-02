document.addEventListener('DOMContentLoaded', () => {
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.forEach(el => new bootstrap.Tooltip(el));
});

// Timestamp (seconds) up to which PBs/metrics should be computed. null means no filter (use all solves).
let filterTimestamp = null;

function computeBestAverage(arr, n) {
  if (arr.length < n) return null;
  let best = Infinity;
  for (let i = 0; i <= arr.length - n; i++) {
    const slice = arr.slice(i, i + n);
    let avg;
    if (n >= 5) {
      const sorted = [...slice].sort((a, b) => a - b).slice(1, -1);
      avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    } else {
      avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    }
    if (avg < best) best = avg;
  }
  return best;
}

function formatTime(seconds) {
  if (seconds === null) return '-';
  if (seconds < 60) return seconds.toFixed(2);

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = (seconds % 60).toFixed(2);

  const mm = m.toString().padStart(2, '0');
  const [intPart, decPart] = s.split('.');
  const ss = intPart.padStart(2, '0') + '.' + decPart;

  if (h > 0) {
    return `${h}:${mm}:${ss}`;
  } else {
    return `${m}:${ss}`;
  }
}

function formatDate(timestamp) {
  if (!timestamp) return '-';
  const d = new Date(timestamp * 1000);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const outputDiv = document.getElementById('output');
let allEventData = [];

document.getElementById('fileInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = evt => {
    outputDiv.innerHTML = '';
    allEventData = [];

    try {
      const data = JSON.parse(evt.target.result);

      // Parse session names
      let sessionNames = {};
      if (data.properties && data.properties.sessionData) {
        try {
          const sd = JSON.parse(data.properties.sessionData);
          for (const [key, val] of Object.entries(sd)) {
            sessionNames['session' + key] = val.name ? val.name.toString() : ('session' + key);
          }
        } catch {}
      }

      for (const [sessionKey, solves] of Object.entries(data)) {
        if (!Array.isArray(solves)) continue;
        const eventName = sessionNames[sessionKey] || sessionKey;

        const validSolves = solves
          .filter(s => Array.isArray(s) && Array.isArray(s[0]) && s[0][0] === 0 && s[0][1] > 0)
          .map(s => ({ time: s[0][1] / 1000, date: s[3] || null }));

        if (validSolves.length === 0) continue;

        const times = validSolves.map(s => s.time);

        function bestAvg(n) {
          if (times.length < n) return null;
          let best = Infinity;
          for (let i = 0; i <= times.length - n; i++) {
            const slice = times.slice(i, i + n);
            let avg;
            if (n >= 5) {
              const sorted = [...slice].sort((a, b) => a - b).slice(1, -1);
              avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
            } else {
              avg = slice.reduce((a, b) => a + b, 0) / slice.length;
            }
            if (avg < best) best = avg;
          }
          return best;
        }

        function getSinglePBHistory(solves) {
          const sortedByDate = solves.slice().sort((a, b) => a.date - b.date);
          let currentPB = Infinity;
          const pbHistory = [];

          for (const s of sortedByDate) {
            if (s.time < currentPB) {
              currentPB = s.time;
              pbHistory.push(s);
            }
          }
          return pbHistory.reverse();
        }

        function getAveragePBHistory(solves, n) {
          if (solves.length < n) return [];

          const sortedByDate = solves.slice().sort((a, b) => a.date - b.date);
          let currentPB = Infinity;
          const pbHistory = [];

          for (let i = 0; i <= sortedByDate.length - n; i++) {
            const window = sortedByDate.slice(i, i + n);
            const times = window.map(s => s.time);
            let avg;

            if (n >= 5) {
              const trimmed = [...times].sort((a, b) => a - b).slice(1, -1);
              avg = trimmed.reduce((sum, val) => sum + val, 0) / trimmed.length;
            } else {
              avg = times.reduce((sum, val) => sum + val, 0) / times.length;
            }

            if (avg < currentPB) {
              currentPB = avg;
              pbHistory.push({
                avg,
                solves: window,
                date: window[n - 1].date
              });
            }
          }

          return pbHistory.reverse();
        }

        // Modify PB history functions to accept an optional cutoff timestamp (seconds)
        function getSinglePBHistoryUpTo(solves, upTo) {
          const filtered = solves.filter(s => (s.date === null ? 0 : s.date) <= (upTo || Infinity));
          if (filtered.length === 0) return [];
          const sortedByDate = filtered.slice().sort((a, b) => a.date - b.date);
          let currentPB = Infinity;
          const pbHistory = [];
          for (const s of sortedByDate) {
            if (s.time < currentPB) {
              currentPB = s.time;
              pbHistory.push(s);
            }
          }
          return pbHistory.reverse();
        }

        function getAveragePBHistoryUpTo(solves, n, upTo) {
          const filtered = solves.filter(s => (s.date === null ? 0 : s.date) <= (upTo || Infinity));
          if (filtered.length < n) return [];

          const sortedByDate = filtered.slice().sort((a, b) => a.date - b.date);
          let currentPB = Infinity;
          const pbHistory = [];

          for (let i = 0; i <= sortedByDate.length - n; i++) {
            const window = sortedByDate.slice(i, i + n);
            const times = window.map(s => s.time);
            let avg;

            if (n >= 5) {
              const trimmed = [...times].sort((a, b) => a - b).slice(1, -1);
              avg = trimmed.reduce((sum, val) => sum + val, 0) / trimmed.length;
            } else {
              avg = times.reduce((sum, val) => sum + val, 0) / times.length;
            }

            if (avg < currentPB) {
              currentPB = avg;
              pbHistory.push({
                avg,
                solves: window,
                date: window[n - 1].date
              });
            }
          }

          return pbHistory.reverse();
        }

        allEventData.push({
          event: eventName,
          solves: validSolves,
          times,
          single: Math.min(...times),
          ao3: bestAvg(3),
          ao5: bestAvg(5),
          ao12: bestAvg(12),
          ao50: bestAvg(50),
          ao100: bestAvg(100),
          // getPBHistory(metric, upToSeconds)
          getPBHistory: function(metric, upTo) {
            if (metric === 'single') {
              return getSinglePBHistoryUpTo(this.solves, upTo);
            }
            const nMap = { ao3: 3, ao5: 5, ao12: 12, ao50: 50, ao100: 100 };
            if (!nMap[metric]) return [];
            return getAveragePBHistoryUpTo(this.solves, nMap[metric], upTo);
          }
        });
      }

      if (allEventData.length === 0) {
        outputDiv.innerHTML = `<div class="alert alert-warning text-center" role="alert">
          No valid solves found in the JSON file.
        </div>`;
        return;
      }

      renderTable();
    } catch (err) {
      outputDiv.innerHTML = `<div class="alert alert-danger text-center" role="alert">
        Error parsing JSON file.
      </div>`;
      console.error(err);
    }
  };
  reader.readAsText(file);
});

function renderTable() {
  let html = `
    <table class="table table-striped table-bordered table-hover table-fixed text-center align-middle">
      <thead class="table-dark">
        <tr>
          <th style="width: 20%;">Event</th>
          <th style="width: 12%;">Single</th>
          <th style="width: 12%;">Ao3</th>
          <th style="width: 12%;">Ao5</th>
          <th style="width: 12%;">Ao12</th>
          <th style="width: 12%;">Ao50</th>
          <th style="width: 12%;">Ao100</th>
        </tr>
      </thead>
      <tbody>
  `;

  allEventData.forEach((row, i) => {
    // compute metrics up to the current filterTimestamp (if any)
    const metrics = computeMetricsForEvent(row, filterTimestamp);
    const cells = ['single', 'ao3', 'ao5', 'ao12', 'ao50', 'ao100'].map(metric => {
      const val = metrics[metric];
      const display = formatTime(val);
      const isClickable = val !== null;
      return `<td
        class="${isClickable ? 'clickable-pb text-primary' : ''}"
        style="cursor: ${isClickable ? 'pointer' : 'default'}"
        data-event-index="${i}"
        data-metric="${metric}"
      >${display}</td>`;
    }).join('');

    html += `<tr>
      <td class="text-start">${row.event}</td>
      ${cells}
    </tr>`;
  });

  html += '</tbody></table>';
  outputDiv.innerHTML = html;

  const modal = new bootstrap.Modal(document.getElementById('pbModal'));
  const modalBody = document.getElementById('pbModalBody');
  const modalTitle = document.getElementById('pbModalLabel');

  // PB cell click handler — ignore Shift+Click
  document.querySelectorAll('.clickable-pb').forEach(cell => {
    cell.addEventListener('click', (e) => {
      if (e.shiftKey) return;

      const eventIndex = parseInt(cell.dataset.eventIndex, 10);
      const metric = cell.dataset.metric;
      const eventData = allEventData[eventIndex];
      if (!eventData) return;

      const pbs = eventData.getPBHistory(metric, filterTimestamp);

      if (!pbs.length) {
        modalBody.innerHTML = `<p>No past PBs found for ${metric.toUpperCase()}.</p>`;
      } else {
        const listItems = pbs.map(s => {
          if (metric === 'single') {
            return `<li>${formatTime(s.time)} <small class="text-muted">(${formatDate(s.date)})</small></li>`;
          } else {
            return `<li>${formatTime(s.avg)} <small class="text-muted">(${formatDate(s.date)})</small></li>`;
          }
        }).join('');

        modalBody.innerHTML = `<ul>${listItems}</ul>`;
      }

      modalTitle.textContent = `${eventData.event} — ${metric.toUpperCase()} PB Progression`;
      modal.show();
    });
  });

  // Shift-click row to delete without opening modal
  document.querySelectorAll('tbody tr').forEach((row, i) => {
    row.addEventListener('click', (e) => {
      if (e.shiftKey) {
        allEventData.splice(i, 1);
        renderTable();
        e.stopPropagation();
        e.preventDefault();
      }
    });
  });
}

// Compute best single/averages for an event up to optional cutoff timestamp (seconds)
function computeMetricsForEvent(eventData, upTo) {
  const filteredSolves = eventData.solves.filter(s => (s.date === null ? 0 : s.date) <= (upTo || Infinity));
  const times = filteredSolves.map(s => s.time);

  function bestAvgTimes(arr, n) {
    if (arr.length < n) return null;
    let best = Infinity;
    for (let i = 0; i <= arr.length - n; i++) {
      const slice = arr.slice(i, i + n);
      let avg;
      if (n >= 5) {
        const sorted = [...slice].sort((a, b) => a - b).slice(1, -1);
        avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
      } else {
        avg = slice.reduce((a, b) => a + b, 0) / slice.length;
      }
      if (avg < best) best = avg;
    }
    return best;
  }

  return {
    single: times.length ? Math.min(...times) : null,
    ao3: bestAvgTimes(times, 3),
    ao5: bestAvgTimes(times, 5),
    ao12: bestAvgTimes(times, 12),
    ao50: bestAvgTimes(times, 50),
    ao100: bestAvgTimes(times, 100)
  };
}

// Wire filter buttons
document.addEventListener('DOMContentLoaded', () => {
  const applyBtn = document.getElementById('applyFilterBtn');
  const clearBtn = document.getElementById('clearFilterBtn');
  const dateInput = document.getElementById('filterDate');

  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      const v = dateInput.value; // YYYY-MM-DD
      if (!v) return;
      // set to end of day in local time
      const dt = new Date(v + 'T23:59:59');
      filterTimestamp = Math.floor(dt.getTime() / 1000);
      renderTable();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      filterTimestamp = null;
      if (dateInput) dateInput.value = '';
      renderTable();
    });
  }
});
