// calculator.js - Handles all calculations and API calls for collar strategy

class CollarCalculator {
    constructor(apiToken) {
      this.apiToken = apiToken;
      this.apiCalls = 0;
    }
  
    // Calculate DTE from expiration date string
    calculateDTE(expirationStr) {
      const expDate = new Date(expirationStr + 'T00:00:00Z');
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const diffTime = expDate.getTime() - today.getTime();
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
  
    // Fetch options data for multiple stocks
    async fetchOptionsData(stocks, filters) {
      const { minStrikePct, maxStrikePct, minDte, maxDte } = filters;
      const allRecords = [];
      this.apiCalls = 0;
  
      for (const symbol of stocks) {
        try {
          const records = await this.fetchStockOptions(symbol, {
            minStrikePct,
            maxStrikePct,
            minDte,
            maxDte
          });
          allRecords.push(...records);
        } catch (error) {
          console.error(`Error fetching data for ${symbol}:`, error);
        }
      }
  
      return {
        records: allRecords,
        apiCalls: this.apiCalls
      };
    }
  
    // Fetch options for a single stock
    async fetchStockOptions(symbol, filters) {
      const { minStrikePct, maxStrikePct, minDte, maxDte } = filters;
      const records = [];
  
      // Get expirations
      this.apiCalls++;
      const expRes = await fetch(
        `https://api.marketdata.app/v1/options/expirations/${symbol}`,
        { headers: { Authorization: `Bearer ${this.apiToken}` } }
      );
      const expJson = await expRes.json();
      const allExpirations = expJson.expirations || [];
  
      if (!allExpirations.length) return records;
  
      // Filter expirations by DTE range
      const filteredExpirations = allExpirations.filter(expStr => {
        const dte = this.calculateDTE(expStr);
        return dte >= minDte && dte <= maxDte;
      });
  
      if (!filteredExpirations.length) return records;
  
      // Get first expiration to fetch underlying price
      this.apiCalls++;
      const firstChainRes = await fetch(
        `https://api.marketdata.app/v1/options/chain/${symbol}/?expiration=${filteredExpirations[0]}&side=call`,
        { headers: { Authorization: `Bearer ${this.apiToken}` } }
      );
      const firstData = await firstChainRes.json();
      if (firstData.s !== 'ok' || !firstData.underlyingPrice?.length) return records;
  
      const price = firstData.underlyingPrice[0];
      const minStrike = Math.floor(price * (minStrikePct / 100));
      const maxStrike = Math.floor(price * (maxStrikePct / 100));
  
      // Fetch all expirations for both calls and puts
      for (const expStr of filteredExpirations) {
        // Fetch calls
        this.apiCalls++;
        const callRes = await fetch(
          `https://api.marketdata.app/v1/options/chain/${symbol}/?expiration=${expStr}&side=call&strike=${minStrike}-${maxStrike}`,
          { headers: { Authorization: `Bearer ${this.apiToken}` } }
        );
        const callData = await callRes.json();
        
        // Fetch puts
        this.apiCalls++;
        const putRes = await fetch(
          `https://api.marketdata.app/v1/options/chain/${symbol}/?expiration=${expStr}&side=put&strike=${minStrike}-${maxStrike}`,
          { headers: { Authorization: `Bearer ${this.apiToken}` } }
        );
        const putData = await putRes.json();
        
        if (callData.s !== 'ok' || putData.s !== 'ok') continue;
        
        // Create a map of calls by strike
        const callMap = new Map();
        for (let i = 0; i < (callData.strike?.length || 0); i++) {
          callMap.set(callData.strike[i], {
            bid: callData.bid[i],
            ask: callData.ask[i],
            mid: callData.mid[i]
          });
        }
        
        // Match with puts and calculate collar metrics
        for (let i = 0; i < (putData.strike?.length || 0); i++) {
          const strike = putData.strike[i];
          const call = callMap.get(strike);
          
          // Only process if we have matching call and put
          if (!call) continue;
          
          const putBid = putData.bid[i];
          const putAsk = putData.ask[i];
          const putMid = putData.mid[i];
          const dte = putData.dte[i];
          const exp = putData.expiration[i];
          
          // Calculate collar metrics
          const metrics = this.calculateCollarMetrics(
            price, 
            strike, 
            call.mid, 
            putMid, 
            dte
          );
          
          // Only include profitable collars
          if (metrics.collar <= 0) continue;
          
          records.push({
            symbol,
            price,
            exp,
            expDate: new Date(exp * 1000).toLocaleDateString('en-GB'),
            dte,
            strike,
            callBid: call.bid,
            callAsk: call.ask,
            callMid: call.mid,
            putBid,
            putAsk,
            putMid,
            ...metrics
          });
        }
      }
  
      return records;
    }
  
    // Calculate collar financial metrics
    calculateCollarMetrics(price, strike, callMid, putMid, dte) {
      const netCost = (price - callMid + putMid) * 100;
      const collar = (strike - price + callMid - putMid) * 100;
      const annReturn = (collar / netCost) * (365 / dte) * 100;
      const strikePricePct = (strike / price) * 100;
  
      return {
        netCost,
        collar,
        annReturn,
        strikePricePct
      };
    }
  
    // Sort records
    static sortRecords(records, column, direction) {
      const sorted = [...records];
      
      sorted.sort((a, b) => {
        let aVal = a[column];
        let bVal = b[column];
        
        // Handle special cases
        if (column === 'symbol' || column === 'expDate') {
          aVal = aVal.toString();
          bVal = bVal.toString();
        } else if (typeof aVal === 'string' && aVal.includes('%')) {
          aVal = parseFloat(aVal);
          bVal = parseFloat(bVal);
        }
        
        let primary = 0;
        if (aVal < bVal) primary = -1;
        else if (aVal > bVal) primary = 1;
        
        if (direction === 'desc') primary *= -1;
        
        // Secondary sort by annReturn (always descending)
        if (primary === 0 && column !== 'annReturn') {
          return b.annReturn - a.annReturn;
        }
        
        return primary;
      });
      
      return sorted;
    }
  }
  
  // Export for use in other files
  window.CollarCalculator = CollarCalculator;