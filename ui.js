// ui.js - Handles all DOM manipulation and UI interactions for collar strategy

document.addEventListener('DOMContentLoaded', () => {
    // State management
    let sortState = { column: null, direction: null };
    let allFetchedRecords = [];
    let savedStocks = JSON.parse(localStorage.getItem('savedStocks') || '[]');
    let calculator = null;
  
    // Restore token if saved
    const saved = localStorage.getItem('apiToken');
    if (saved) document.getElementById('apiToken').value = saved;
  
    // Number formatting function
    const formatNumber = (num) => {
      if (typeof num !== 'number') return num;
      return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };
  
    // Initialize dual range sliders
    function initializeRangeSliders() {
      // Initialize Strike-% slider
      initializeRangeSlider('strike', {
        min: 0,
        max: 100,
        startMin: 30,
        startMax: 80,
        suffix: '%',
        minInputId: 'minStrike',
        maxInputId: 'maxStrike'
      });
      
      // Initialize DTE slider
      initializeRangeSlider('dte', {
        min: 1,
        max: 365,
        startMin: 1,
        startMax: 45,
        suffix: ' days',
        minInputId: 'minDte',
        maxInputId: 'maxDte'
      });
    }
  
    // Generic range slider initialization
    function initializeRangeSlider(sliderName, options) {
      const rangeSlider = document.querySelector(`[data-slider="${sliderName}"]`);
      const rangeTrack = rangeSlider.querySelector('.range-track');
      const rangeSelected = rangeSlider.querySelector('.range-selected');
      const minThumb = rangeSlider.querySelector('.thumb-min');
      const maxThumb = rangeSlider.querySelector('.thumb-max');
      const minValue = document.getElementById(options.minInputId);
      const maxValue = document.getElementById(options.maxInputId);
      const display = rangeSlider.querySelector('.range-display');
      
      let minVal = options.startMin;
      let maxVal = options.startMax;
      
      function updateSlider() {
        const percent1 = ((minVal - options.min) / (options.max - options.min)) * 100;
        const percent2 = ((maxVal - options.min) / (options.max - options.min)) * 100;
        
        rangeSelected.style.left = percent1 + '%';
        rangeSelected.style.width = (percent2 - percent1) + '%';
        
        minThumb.style.left = percent1 + '%';
        maxThumb.style.left = percent2 + '%';
        
        minValue.value = minVal;
        maxValue.value = maxVal;
        
        const displayText = sliderName === 'dte' 
          ? `${minVal} - ${maxVal}${options.suffix}`
          : `${minVal}${options.suffix} - ${maxVal}${options.suffix}`;
        display.textContent = displayText;
      }
      
      function handleMinThumb(e) {
        e.preventDefault();
        const startX = e.clientX || e.touches[0].clientX;
        const startVal = minVal;
        const rect = rangeTrack.getBoundingClientRect();
        
        function onMove(e) {
          const currentX = e.clientX || e.touches[0].clientX;
          const diff = currentX - startX;
          const percent = (diff / rect.width) * 100;
          const range = options.max - options.min;
          let newVal = Math.round(startVal + (percent * range / 100));
          
          newVal = Math.max(options.min, Math.min(newVal, maxVal - 1));
          minVal = newVal;
          updateSlider();
        }
        
        function onEnd() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onEnd);
          document.removeEventListener('touchmove', onMove);
          document.removeEventListener('touchend', onEnd);
        }
        
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchmove', onMove);
        document.addEventListener('touchend', onEnd);
      }
      
      function handleMaxThumb(e) {
        e.preventDefault();
        const startX = e.clientX || e.touches[0].clientX;
        const startVal = maxVal;
        const rect = rangeTrack.getBoundingClientRect();
        
        function onMove(e) {
          const currentX = e.clientX || e.touches[0].clientX;
          const diff = currentX - startX;
          const percent = (diff / rect.width) * 100;
          const range = options.max - options.min;
          let newVal = Math.round(startVal + (percent * range / 100));
          
          newVal = Math.max(minVal + 1, Math.min(newVal, options.max));
          maxVal = newVal;
          updateSlider();
        }
        
        function onEnd() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onEnd);
          document.removeEventListener('touchmove', onMove);
          document.removeEventListener('touchend', onEnd);
        }
        
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchmove', onMove);
        document.addEventListener('touchend', onEnd);
      }
      
      minThumb.addEventListener('mousedown', handleMinThumb);
      minThumb.addEventListener('touchstart', handleMinThumb);
      maxThumb.addEventListener('mousedown', handleMaxThumb);
      maxThumb.addEventListener('touchstart', handleMaxThumb);
      
      // Click on track to move nearest thumb
      rangeTrack.addEventListener('click', (e) => {
        if (e.target.classList.contains('thumb')) return;
        
        const rect = rangeTrack.getBoundingClientRect();
        const percent = ((e.clientX - rect.left) / rect.width) * 100;
        const range = options.max - options.min;
        const value = options.min + (percent * range / 100);
        
        const distToMin = Math.abs(value - minVal);
        const distToMax = Math.abs(value - maxVal);
        
        if (distToMin < distToMax) {
          minVal = Math.round(Math.max(options.min, Math.min(value, maxVal - 1)));
        } else {
          maxVal = Math.round(Math.max(minVal + 1, Math.min(value, options.max)));
        }
        
        updateSlider();
      });
      
      updateSlider();
    }
  
    // Create stock input section
    function createStockInputSection() {
      const container = document.getElementById('tradeForm');
      const stockSection = document.createElement('div');
      stockSection.className = 'stock-input-section';
      stockSection.innerHTML = `
        <div class="manual-stocks">
          <h3>Enter Stocks</h3>
          <div id="stockInputs">
            <div class="stock-input-row">
              <input type="text" class="stock-input" maxlength="7" placeholder="e.g., AAPL">
              <label class="save-label" style="display: none;"><input type="checkbox" class="save-stock-cb"> Save</label>
            </div>
          </div>
          <button type="button" id="addStockBtn" class="add-stock-btn">+ Add More</button>
        </div>
        
        <div class="saved-stocks-section">
          <h3>Saved Stocks</h3>
          <div id="savedStocks" class="stock-checkboxes"></div>
        </div>
      `;
      
      // Insert after API token field
      const apiGroup = container.querySelector('.form-group');
      apiGroup.after(stockSection);
      
      // Remove old symbol input
      const oldSymbolGroup = container.querySelector('label:has(#symbol)').parentElement;
      oldSymbolGroup.remove();
      
      // Initial render of saved stocks
      renderSavedStocks();
      
      // Add stock button handler
      document.getElementById('addStockBtn').addEventListener('click', addStockInput);
      
      // Add input handler for first input
      const firstInput = container.querySelector('.stock-input');
      firstInput.addEventListener('input', handleStockInputChange);
    }
  
    // Handle input change to show/hide save button
    function handleStockInputChange(e) {
      const saveLabel = e.target.parentElement.querySelector('.save-label');
      if (e.target.value.trim()) {
        saveLabel.style.display = 'inline-flex';
      } else {
        saveLabel.style.display = 'none';
        // Uncheck if input is cleared
        const checkbox = saveLabel.querySelector('.save-stock-cb');
        if (checkbox) checkbox.checked = false;
      }
    }
  
    // Add new stock input row
    function addStockInput() {
      const container = document.getElementById('stockInputs');
      const row = document.createElement('div');
      row.className = 'stock-input-row';
      row.innerHTML = `
        <input type="text" class="stock-input" maxlength="7" placeholder="e.g., AAPL">
        <label class="save-label" style="display: none;"><input type="checkbox" class="save-stock-cb"> Save</label>
        <button type="button" class="remove-input-btn">×</button>
      `;
      container.appendChild(row);
      
      // Add input handler
      const input = row.querySelector('.stock-input');
      input.addEventListener('input', handleStockInputChange);
      
      // Remove button handler
      row.querySelector('.remove-input-btn').addEventListener('click', () => {
        row.remove();
      });
    }
  
    // Render saved stocks with remove buttons
    function renderSavedStocks() {
      const savedDiv = document.getElementById('savedStocks');
      savedDiv.innerHTML = '';
      
      if (savedStocks.length === 0) {
        savedDiv.innerHTML = '<span class="no-saved">No saved stocks yet. Enter a stock symbol and check "Save" to add it here.</span>';
        return;
      }
      
      savedStocks.forEach(stock => {
        const wrapper = document.createElement('div');
        wrapper.className = 'saved-stock-wrapper';
        wrapper.innerHTML = `
          <label class="stock-checkbox">
            <input type="checkbox" value="${stock}"> ${stock}
          </label>
          <button type="button" class="remove-saved-btn" data-stock="${stock}">×</button>
        `;
        savedDiv.appendChild(wrapper);
      });
      
      // Add remove handlers
      savedDiv.querySelectorAll('.remove-saved-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const stock = e.target.dataset.stock;
          savedStocks = savedStocks.filter(s => s !== stock);
          localStorage.setItem('savedStocks', JSON.stringify(savedStocks));
          renderSavedStocks();
        });
      });
    }
  
    // Get all selected stocks
    function getSelectedStocks() {
      const stocks = new Set();
      
      // Manual inputs
      document.querySelectorAll('.stock-input').forEach((input, idx) => {
        const value = input.value.trim().toUpperCase();
        if (value) {
          stocks.add(value);
          
          // Check if should save
          const saveCheckbox = input.parentElement.querySelector('.save-stock-cb');
          if (saveCheckbox?.checked && !savedStocks.includes(value)) {
            savedStocks.push(value);
            localStorage.setItem('savedStocks', JSON.stringify(savedStocks));
          }
        }
      });
      
      // Checked saved stocks
      document.querySelectorAll('#savedStocks input:checked').forEach(cb => {
        stocks.add(cb.value);
      });
      
      return Array.from(stocks);
    }
  
    // Create sortable table header
    function createTableHeader(isSingleSymbol = false) {
      const headers = [
        { key: 'symbol', label: 'Symbol', skip: isSingleSymbol },
        { key: 'price', label: 'Stock Price', skip: isSingleSymbol },
        { key: 'expDate', label: 'Expire Date' },
        { key: 'dte', label: 'DTE' },
        { key: 'strike', label: 'Strike' },
        { key: 'strikePricePct', label: 'Strike/Price %' },
        { key: 'callBid', label: 'Call Bid' },
        { key: 'callAsk', label: 'Call Ask' },
        { key: 'callMid', label: 'Call Mid' },
        { key: 'putBid', label: 'Put Bid' },
        { key: 'putAsk', label: 'Put Ask' },
        { key: 'putMid', label: 'Put Mid' },
        { key: 'netCost', label: 'Net Cost' },      
        { key: 'collar', label: 'Collar (Profit)' },
        { key: 'annReturn', label: 'Ann. Return %' }
      ];
      
      const thead = document.createElement('thead');
      const tr = document.createElement('tr');
      
      headers.forEach(({ key, label, skip }) => {
        if (skip) return;
        
        const th = document.createElement('th');
        th.className = 'sortable';
        th.dataset.column = key;
        th.innerHTML = `${label} <span class="sort-arrow"></span>`;
        
        th.addEventListener('click', () => handleSort(key));
        
        // Update arrow display
        if (sortState.column === key) {
          th.classList.add('sorted');
          const arrow = th.querySelector('.sort-arrow');
          arrow.textContent = sortState.direction === 'asc' ? '▲' : '▼';
        }
        
        tr.appendChild(th);
      });
      
      thead.appendChild(tr);
      return thead;
    }
  
    // Handle column sort
    function handleSort(column) {
      if (sortState.column === column) {
        // Cycle through: asc -> desc -> null
        if (sortState.direction === 'asc') {
          sortState.direction = 'desc';
        } else if (sortState.direction === 'desc') {
          sortState.column = null;
          sortState.direction = null;
        }
      } else {
        sortState.column = column;
        sortState.direction = 'asc';
      }
      
      // Re-render table with new sort
      renderResults();
    }
  
    // Render results table
    function renderResults() {
      const container = document.getElementById('resultsContainer');
      
      let displayRows = [...allFetchedRecords];
      
      // Apply sort using the calculator's sort function
      if (sortState.column) {
        displayRows = CollarCalculator.sortRecords(displayRows, sortState.column, sortState.direction);
      } else {
        // Default sort by annReturn descending
        displayRows.sort((a, b) => b.annReturn - a.annReturn);
      }
      
      // Clear and rebuild
      container.innerHTML = '';
      
      // Check if single symbol
      const uniqueSymbols = [...new Set(displayRows.map(r => r.symbol))];
      const isSingleSymbol = uniqueSymbols.length === 1;
      
      if (isSingleSymbol) {
        // Display symbol and price info above table
        const stockInfo = document.createElement('div');
        stockInfo.className = 'stock-info';
        stockInfo.innerHTML = `
          <h2>${uniqueSymbols[0]}</h2>
          <p class="stock-price">Current Price: $${formatNumber(displayRows[0].price)}</p>
        `;
        container.appendChild(stockInfo);
      }
      
      const summary = document.createElement('p');
      summary.textContent = `Showing ${displayRows.length} profitable collar opportunities.`;
      container.appendChild(summary);
      
      const table = document.createElement('table');
      table.className = 'result-table';
      table.appendChild(createTableHeader(isSingleSymbol));
      
      const tbody = document.createElement('tbody');
      displayRows.forEach(r => {
        const row = document.createElement('tr');
        const cells = [];
        
        if (!isSingleSymbol) {
          cells.push(`<td>${r.symbol}</td>`);
          cells.push(`<td>${formatNumber(r.price)}</td>`);
        }
        
        cells.push(
          `<td>${r.expDate}</td>`,
          `<td>${r.dte}</td>`,
          `<td>${formatNumber(r.strike)}</td>`,
          `<td>${r.strikePricePct.toFixed(2)}%</td>`,
          `<td>${formatNumber(r.callBid)}</td>`,
          `<td>${formatNumber(r.callAsk)}</td>`,
          `<td>${formatNumber(r.callMid)}</td>`,
          `<td>${formatNumber(r.putBid)}</td>`,
          `<td>${formatNumber(r.putAsk)}</td>`,
          `<td>${formatNumber(r.putMid)}</td>`,
          `<td>${formatNumber(r.netCost)}</td>`,        
          `<td class="profit">${formatNumber(r.collar)}</td>`,
          `<td class="return">${formatNumber(r.annReturn)}%</td>`
        );
        
        row.innerHTML = cells.join('');
        tbody.appendChild(row);
      });
      
      table.appendChild(tbody);
      container.appendChild(table);
    }
  
    // Initialize stock input section
    createStockInputSection();
    
    // Initialize range sliders
    setTimeout(initializeRangeSliders, 100);
  
    // Main form submission
    document.getElementById('tradeForm').addEventListener('submit', async e => {
      e.preventDefault();
  
      const apiToken = document.getElementById('apiToken').value.trim();
      const minStrikePct = parseInt(document.getElementById('minStrike').value);
      const maxStrikePct = parseInt(document.getElementById('maxStrike').value);
      const minDte = parseInt(document.getElementById('minDte').value) || 1;
      const maxDte = parseInt(document.getElementById('maxDte').value) || 365;
      const msg = document.getElementById('message');
      const container = document.getElementById('resultsContainer');
  
      localStorage.setItem('apiToken', apiToken);
      
      // Get selected stocks
      const stocks = getSelectedStocks();
      if (stocks.length === 0) {
        msg.textContent = 'Please select at least one stock.';
        return;
      }
      
      msg.textContent = `Loading collar options for ${stocks.length} stock(s)...`;
      container.innerHTML = '';
      
      // Reset sort state
      sortState = { column: null, direction: null };
      allFetchedRecords = [];
  
      try {
        // Create calculator instance
        calculator = new CollarCalculator(apiToken);
        
        // Fetch data using calculator
        const result = await calculator.fetchOptionsData(stocks, {
          minStrikePct,
          maxStrikePct,
          minDte,
          maxDte
        });
        
        allFetchedRecords = result.records;
  
        if (!allFetchedRecords.length) {
          msg.textContent = 'No profitable collar positions found. Try adjusting your filters.';
          return;
        }
  
        msg.textContent = `Found ${allFetchedRecords.length} profitable collar positions. API calls: ${result.apiCalls}`;
        
        // Update saved stocks display
        renderSavedStocks();
        
        // Render results
        renderResults();
  
      } catch (err) {
        console.error(err);
        msg.textContent = `Error: ${err.message}. Check your API token and try again.`;
      }
    });
  });