document.addEventListener('DOMContentLoaded', () => {
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.forEach(el => new bootstrap.Tooltip(el));
});

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

        // Correct chronological PB progression for singles
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

        // Correct chronological PB progression for averages
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
          getPBHistory: function(metric) {
            if (metric === 'single') {
              return getSinglePBHistory(this.solves);
            }
            const nMap = { ao3: 3, ao5: 5, ao12: 12, ao50: 50, ao100: 100 };
            if (!nMap[metric]) return [];
            return getAveragePBHistory(this.solves, nMap[metric]);
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
          <th style="width: 5%;">Remove</th>
        </tr>
      </thead>
      <tbody>
  `;

  allEventData.forEach((row, i) => {
    const cells = ['single', 'ao3', 'ao5', 'ao12', 'ao50', 'ao100'].map(metric => {
      const val = row[metric];
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
      <td><span class="remove-btn" data-index="${i}" title="Remove event">&times;</span></td>
    </tr>`;
  });

  html += '</tbody></table>';
  outputDiv.innerHTML = html;

  // Add modal click handlers
  const modal = new bootstrap.Modal(document.getElementById('pbModal'));
  const modalBody = document.getElementById('pbModalBody');
  const modalTitle = document.getElementById('pbModalLabel');

  document.querySelectorAll('.clickable-pb').forEach(cell => {
    cell.addEventListener('click', () => {
      const eventIndex = parseInt(cell.dataset.eventIndex, 10);
      const metric = cell.dataset.metric;
      const eventData = allEventData[eventIndex];
      if (!eventData) return;

      const pbs = eventData.getPBHistory(metric);

      if (!pbs.length) {
        modalBody.innerHTML = `<p>No past PBs found for ${metric.toUpperCase()}.</p>`;
      } else {
        // Chronological PB progression (oldest first)
        const listItems = pbs.map(s => {
          if (metric === 'single') {
            return `<li>${formatTime(s.time)} <small class="text-muted">(${formatDate(s.date)})</small></li>`;
          } else {
            // average entries have .avg and solves array
            return `<li>${formatTime(s.avg)} <small class="text-muted">(${formatDate(s.date)})</small></li>`;
          }
        }).join('');

        modalBody.innerHTML = `<ul>${listItems}</ul>`;
      }

      modalTitle.textContent = `${eventData.event} — ${metric.toUpperCase()} PB Progression`;
      modal.show();
    });
  });

  // Remove event row handler
  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = parseInt(e.target.dataset.index, 10);
      if (!isNaN(idx)) {
        allEventData.splice(idx, 1);
        renderTable();
      }
    });
  });
}
