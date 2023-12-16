const TelegramBot = require('node-telegram-bot-api');
const { Web3 } = require('web3');
const axios = require('axios');
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const Canvas = require('canvas');
const { registerFont, loadImage } = require('canvas');

const WEBSOCKET = "wss://floral-proud-card.quiknode.pro/80e94110c148cda4187610df712dca8112816245/";
const web3 = new Web3(WEBSOCKET);
const ETHERSCAN_API = process.env.ETHERSCAN_API;
const ETHERSCAN_API2 = process.env.ETHERSCAN_API2;
const TokenABI = require('./TokenABI.json');
const UniswapV2RouterABI = require('./MainnetRouterABI.json');

const TOKEN = '6968815383:AAEDOE4pT0y5c0I1KpMRv0c8IHRkZUNMAPo'

const ethPriceInUSDUrl = process.env.ETH_PRICE_IN_USD_URL;

const bot = new TelegramBot(TOKEN, {
  polling: true
});

const SWAP_ETH_FOR_TOKENS = ['0x7ff36ab5', '0xb6f9de95'];
const SWAP_TOKENS_FOR_ETH = ['0x18cbafe5', '0x791ac947'];

const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const UNISWAP_V2_ROUTER_ADDRESS = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';

const routerContract = new web3.eth.Contract(UniswapV2RouterABI, UNISWAP_V2_ROUTER_ADDRESS);


function fontFile (name){
  return path.join(__dirname, '/fonts/', name)
}

const defaultKeyboardMarkup = {
  keyboard: [
      [{
          text: '⚡ Start',
      }]
  ],
  resize_keyboard: true,
  one_time_keyboard: false,
  selective: false
}

bot.on('message', async (inputText) => {
  const chatId = inputText.chat.id;
  const messageId = inputText.message_id;
  const text = inputText.text;

  bot.deleteMessage(chatId, messageId);

  switch (true) {
      
      case /^(0x[a-fA-F0-9]{40})$/.test(text):
                  updatePnlMessage(chatId);
      break;

      case /^\/start\b/.test(text):
                  updatePnlMessage(chatId);          
          break;

          case /^(⚡ Start)$/.test(text):
                  updatePnlMessage(chatId);
            break;    
  }
});

async function displayTransactionDetails(transactionHash) {
  const txDetails = await web3.eth.getTransactionReceipt(transactionHash);

  let receivedETH = 0;

  txDetails.logs.forEach(log => {
      if (log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
          const valTransferred = BigInt(log.data);
          if (log.address === WETH_ADDRESS.toLowerCase()) {
              receivedETH = Number(valTransferred);
              console.log("Received ETH:", receivedETH);
          }
      }
  });
  return receivedETH;
}



async function main(tokenAddress, walletAddress) {
  let totalEthSpent = 0;
  let totalTokensBought = 0;
  let totalTokensSold = 0;
  let totalEthReceived = 0;
  let totalGasUsed = 0;

  const txListResponse = await axios.get(`https://api.etherscan.io/api?module=account&action=txlist&address=${walletAddress}&sort=asc&apikey=${ETHERSCAN_API}&to=${UNISWAP_V2_ROUTER_ADDRESS}`);
  const tokenTxResponse = await axios.get(`https://api.etherscan.io/api?module=account&action=tokentx&address=${walletAddress}&startblock=0&endblock=999999999&sort=asc&apikey=${ETHERSCAN_API2}&contractAddress=${tokenAddress}`);

  const decimals = tokenTxResponse.data.result[0].tokenDecimal;
  const tokenName = tokenTxResponse.data.result[0].tokenName;
  const tokenSymbol = tokenTxResponse.data.result[0].tokenSymbol;

  for (const tokenTx of tokenTxResponse.data.result) {
    const tx = txListResponse.data.result.find(t => t.hash === tokenTx.hash);

    if (tx) {
      const gasUsed = Number(tx.gasUsed);
      const gasPrice = Number(tx.gasPrice);
      let methodId = tx.methodId;
      console.log("Method ID:", methodId);

      if (SWAP_ETH_FOR_TOKENS.includes(methodId)) {
        const ethSpent = Number(tx.value);
        const tokensBought = Number(tokenTx.value);
        console.log("Tokens Bought:", tokensBought);
        console.log("Hey I'm here!");

        totalEthSpent += ethSpent / 10 ** 18;
        totalTokensBought += tokensBought / 10 ** decimals;
        totalGasUsed += gasUsed * gasPrice;
      } else if (SWAP_TOKENS_FOR_ETH.includes(methodId)) {
        const tokensSold = Number(tokenTx.value);
        console.log("Tokens Sold:", tokensSold);

        console.log("Hey I'm here!");


        const receivedETH = await displayTransactionDetails(tokenTx.hash);
        const ethReceived = receivedETH;

        totalTokensSold += tokensSold / 10 ** decimals;
        totalEthReceived += ethReceived / 10 ** 18;
        totalGasUsed += gasUsed * gasPrice;
      }
    }
  }

  return {
    tokenTxLength: tokenTxResponse.data.result.length,
    tokenName,
    decimals,
    totalEthSpent,
    totalTokensBought,
    totalTokensSold,
    totalEthReceived,
    totalGasUsed,
  };
}



async function updatePnlMessage(chatId){


  bot.sendMessage(chatId, '[Token Address] [Wallet Address]`', {
      reply_markup: {
          force_reply: true
      }
  }).then((sentMessage) => {
      bot.once('message', async (message) => {
          bot.deleteMessage(chatId, sentMessage.message_id);
try{
          let tokenAddress = web3.utils.toChecksumAddress(message.text.split(' ')[0]);
          let walletAddress = web3.utils.toChecksumAddress(message.text.split(' ')[1]);

          const walletStats = await main(tokenAddress, walletAddress);

          let tokenTxLength = walletStats.tokenTxLength;
          let tokenName = walletStats.tokenName;
          let totalEthSpent = walletStats.totalEthSpent;
          let totalTokensBought = walletStats.totalTokensBought;
          let totalTokensSold = walletStats.totalTokensSold;
          let totalEthReceived = walletStats.totalEthReceived;
          let totalGasUsed = walletStats.totalGasUsed;

          console.log("Token Address:", tokenAddress, "Wallet Address:", walletAddress);

          if (!tokenAddress || !walletAddress) {
              bot.sendMessage(chatId, "⚠️ Invalid input. Please enter a valid tokenAddress and walletAddress.").then((message) => {
                  setTimeout(() => {
                      bot.deleteMessage(chatId, message.message_id);
                  }, 3000);
              });
          }else if(tokenTxLength === 0){
              bot.sendMessage(chatId, `⚠️ No trades found for this tokenAddress and walletAddress combination.`).then((message) => {
                  setTimeout(() => {
                      bot.deleteMessage(chatId, message.message_id);
                  }, 3000);
              });
              
          }else {
          
              bot.sendMessage(chatId, "🖩 ɢᴇɴᴇʀᴀᴛɪɴɢ ᴘɴʟ ɪᴍᴀɢᴇ 📊").then((message) => {
                  setTimeout(() => {
                      bot.deleteMessage(chatId, message.message_id);
                  }, 6000);
              });  

              const response = await axios.get(ethPriceInUSDUrl);
              const ethToUsdRate = response.data.USD;

              console.log("Token Name:", tokenName);

              let totalGasGwei = totalGasUsed / 10 ** 9;
          
              let pnl = await calculatePNL(chatId, tokenAddress, walletAddress, walletStats);

              let balance = pnl.balance;

              let holdingsInUsd = (pnl.currentTokenValueInETH * ethToUsdRate).toFixed(2);

              loadImage('PL-bg.png').then(async (image) => {
                  Canvas.registerFont(fontFile('Audiowide-Regular.ttf'), {family: 'Audiowide-Regular'})

                  try{
                      
                      const canvas = Canvas.createCanvas(1200, 750)
                      const ctx = canvas.getContext('2d')
                      registerFont('fonts/Audiowide-Regular.ttf', { family: 'Audiowide' });

                      const Image = Canvas.Image;
                      const img = new Image();
                      img.src = 'PL-bg.png';
                      
                      ctx.clearRect(0, 0, canvas.width, canvas.height);
                      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                      function drawText(ctx, text, x, y, style, maxWidth = 0) {
                          ctx.fillStyle = style.color;
                          ctx.font = `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
                          ctx.textAlign = style.textAlign || 'left';
                          ctx.textBaseline = 'middle';
                          
                          if (maxWidth > 0) {
                              ctx.fillText(text, x, y, maxWidth);
                          } else {
                              ctx.fillText(text, x, y);
                          }
                      }

                      const swiftTitle = {
                          fontSize: 36,
                          color: '#7F00FF',
                          fontFamily: 'Audiowide',
                          fontWeight: '600',
                        };
                      
                      const headerStyle = {
                          fontSize: 36,
                          color: 'white',
                          fontFamily: 'Audiowide',
                        };
                        
                        const contentStyle = {
                          fontSize: 22,
                          color: 'white',
                          fontFamily: 'Audiowide',
                        };

                        const pnlStyle = {
                          fontSize: 28,
                          color: 'white',
                          fontFamily: 'Audiowide',
                        };

                        const pnlPercentStyle = {
                          fontSize: 36,
                          fontFamily: 'Audiowide',
                        };

                        pnlPercentStyle.color = pnl.rPnL >= 0 ? 'green' : 'red';
                      
                        drawText(ctx, 'PnL Analysis', 130, 100, swiftTitle);
                        drawText(ctx, `$${tokenName} Token\n\n`, 150, 175, headerStyle);
                        drawText(ctx, `Total Bought: ${formatNumber(totalTokensBought)}`, 150, 250, contentStyle, 300); // Adjust the maxWidth parameter as needed
                        drawText(ctx, `Total Sold: ${formatNumber(totalTokensSold)}`, 150, 290, contentStyle, 300);
                        drawText(ctx, `Total ETH Spent: ${totalEthSpent.toFixed(2)}`, 150, 350, contentStyle, 380);
                        drawText(ctx, `Total ETH Received: ${totalEthReceived.toFixed(2)}`, 150, 390, contentStyle, 400);
                        drawText(ctx, `Gas Used: ${formatNumber(totalGasGwei)} Gwei (${(totalGasUsed / 10 ** 18).toFixed(2)} Ξ)`, 150, 430, contentStyle, 400);
                        drawText(ctx, `Holdings: ${formatNumber(balance)} (${(pnl.currentTokenValueInETH).toFixed(4)} Ξ) ($${holdingsInUsd})`, 150, 490, contentStyle, 400);
                        drawText(ctx, `UR PnL: ${pnl.onPaperPnL.toFixed(2)} Ξ ($${(pnl.onPaperPnL * ethToUsdRate).toFixed(2)})`, 150, 530, contentStyle, 800);
                        drawText(ctx, `${pnl.urPnL.toFixed(2)}%`, 480, 530, { ...contentStyle, color: pnl.urPnL >= 0 ? 'green' : 'red' }, 300);
                        drawText(ctx, `Realised PnL: ${(pnl.realisedPnL).toFixed(2)} Ξ ($${(pnl.realisedPnL * ethToUsdRate).toFixed(2)})`, 150, 600, pnlStyle, 600);
                        drawText(ctx, `${pnl.rPnL.toFixed(2)}%`, 150, 650, pnlPercentStyle, 300);
                                
                      const buffer = canvas.toBuffer('image/png');
          
                      bot.sendPhoto(chatId, buffer, {
                        reply_markup: defaultKeyboardMarkup,
                    }).then((message) => {
                          setTimeout(() => {
                              bot.deleteMessage(chatId, message.message_id);
                          }, 15000000);
                      });


          }catch(error){
              console.log(error);
              setTimeout(() => {
              bot.sendMessage(chatId, 'Invalid input. Please enter a valid tokenAddress and walletAddress.');
              }, 3000);
          }
              });


      
          }
      }catch(error){
          console.log(error);
          setTimeout(() => {
          bot.sendMessage(chatId, 'Invalid input. Please enter a valid tokenAddress and walletAddress.');
          }, 3000);
      }
      });
  });
}

async function calculatePNL(chatId, tokenAddress, walletAddress, walletStats) {

  let decimals = walletStats.decimals;
  let totalEthReceived = walletStats.totalEthReceived;
  let totalEthSpent = walletStats.totalEthSpent;
  let totalGasUsed = walletStats.totalGasUsed / 10 ** 18;
  let totalTokensBought = walletStats.totalTokensBought;
  let totalTokensSold = walletStats.totalTokensSold;


  const balanceRes = await axios.get(`https://api.etherscan.io/api?module=account&action=tokenbalance&contractaddress=${tokenAddress}&address=${walletAddress}&tag=latest&apikey=${ETHERSCAN_API}`);

  const balance = balanceRes.data.result / 10 ** decimals;
  
  let currentTokenValueInETH;
  let avgHoldingValue;


  if (balance > 0) {
    const balanceInWei = balanceRes.data.result;
  console.log("Balance in Wei:", balanceInWei);
    try {
      const amounts = await routerContract.methods.getAmountsOut(balanceInWei.toString(), [tokenAddress, WETH_ADDRESS]).call();
      let expectedETH = web3.utils.fromWei(amounts[1], 'ether');

      avgHoldingValue = balance / expectedETH;
      console.log("Average Holding Value:", avgHoldingValue);
  
      currentTokenValueInETH = parseFloat(expectedETH);
    } catch (error) {
      console.error("Error executing getAmountsOut");
      currentTokenValueInETH = 0;
    }
  } else {
    currentTokenValueInETH = 0;
  }



let onPaperPnL = 0;
let realisedPnL = 0;
let rPnL = 0;
let urPnL = 0;

let avgBuyPrice = totalTokensBought / (totalEthSpent + totalGasUsed);

let avgSellPrice = totalTokensSold / totalEthReceived;

let avgBuyRate = 1 / avgBuyPrice;
let avgSellRate = 1 / avgSellPrice;

if (totalEthSpent !== 0) {
  let avgHoldingRate = 1 / avgHoldingValue;

  let urPnLValue = (avgHoldingRate - avgBuyRate) * balance;
  urPnL = (urPnLValue / (totalEthSpent + totalGasUsed)) * 100;

  if (totalTokensBought < totalTokensSold) {
    realisedPnL = totalEthReceived - (totalEthSpent + totalGasUsed);
    rPnL = (realisedPnL / (totalEthSpent + totalGasUsed)) * 100;
  } else {
    let avgDifference = avgSellRate - avgBuyRate;
    realisedPnL = (avgDifference * totalTokensSold);
    rPnL = (realisedPnL / (totalEthSpent + totalGasUsed)) * 100;
  }
  
}
  return {balance, currentTokenValueInETH, onPaperPnL, urPnL, realisedPnL, rPnL };
}


function formatNumber(value) {
  value = Number(value); 

  if (value >= 1000000000) {
      return (value / 1000000000).toFixed(1) + 'B';
  } else if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + 'M';
  } else if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'K';
  } else {
      const roundedValue = value.toFixed(1);
      return roundedValue.endsWith('.0') ? roundedValue.slice(0, -2) : roundedValue;
  }
}
