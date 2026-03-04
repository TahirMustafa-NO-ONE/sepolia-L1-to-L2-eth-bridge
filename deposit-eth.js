require('dotenv').config()
const { ethers } = require('ethers')
const { CrossChainMessenger } = require('@eth-optimism/sdk')

async function main() {
  const { PRIVATE_KEY, SEPOLIA_RPC_URL, OP_SEPOLIA_RPC_URL, AMOUNT_ETH } = process.env
  if (!PRIVATE_KEY || !SEPOLIA_RPC_URL || !OP_SEPOLIA_RPC_URL) {
    throw new Error('Missing env variables. Check your .env file.')
  }

  const l1Provider = new ethers.providers.JsonRpcProvider(SEPOLIA_RPC_URL)
  const l2Provider = new ethers.providers.JsonRpcProvider(OP_SEPOLIA_RPC_URL)
  const wallet = new ethers.Wallet(PRIVATE_KEY, l1Provider)

  const messenger = new CrossChainMessenger({
    l1ChainId: 11155111, // Sepolia
    l2ChainId: 11155420, // OP Sepolia
    l1SignerOrProvider: wallet,
    l2SignerOrProvider: l2Provider,
  })

  const amount = ethers.utils.parseEther(AMOUNT_ETH || '2.5')
  console.log(`Depositing ${ethers.utils.formatEther(amount)} ETH from Sepolia → OP Sepolia...`)

  const tx = await messenger.depositETH(amount)
  console.log('Deposit tx sent (L1):', tx.hash)
  console.log(`Etherscan: https://sepolia.etherscan.io/tx/${tx.hash}`)

  const rec = await tx.wait()
  const gasUsed = rec.gasUsed
  const effGasPrice = rec.effectiveGasPrice || rec.gasPrice || ethers.BigNumber.from(0)
  const fee = gasUsed.mul(effGasPrice)

  console.log('--- L1 Receipt ---')
  console.log('status:', rec.status ? 'success' : 'failed')
  console.log('blockNumber:', rec.blockNumber)
  console.log('from:', rec.from)
  console.log('to:', rec.to)
  console.log('gasUsed:', gasUsed.toString())
  console.log('effectiveGasPrice (gwei):', ethers.utils.formatUnits(effGasPrice, 'gwei'))
  console.log('fee (ETH):', ethers.utils.formatEther(fee))
  console.log('logs:', rec.logs.length)

  // Optional: wait for L2 execution and show its tx
  try {
    console.log('Waiting for L2 execution (this can take ~1-3 minutes)...')
    // Works on SDK v3+
    const receipt = await messenger.waitForMessageReceipt(tx.hash)
    if (receipt?.transactionReceipt && receipt?.remoteTransactionReceipt) {
      const l2TxHash = receipt.remoteTransactionReceipt.transactionHash
      console.log('--- L2 Execution ---')
      console.log('L2 tx hash:', l2TxHash)
      console.log(`OP Sepolia explorer: https://sepolia-optimism.etherscan.io/tx/${l2TxHash}`)
      console.log('L2 status:', receipt?.status || 'RECEIVED')
    } else {
      // Fallback: just confirm relayed status
      await messenger.waitForMessageStatus(tx.hash, 'RELAYED')
      console.log('--- L2 Execution ---')
      console.log('Message status: RELAYED (finalized on L2)')
      console.log('Tip: check recent txs on https://sepolia-optimism.etherscan.io/address/' +
        (await wallet.getAddress()))
    }
  } catch (e) {
    console.warn('Could not fetch L2 receipt via SDK:', e?.message || e)
    console.warn('You can still track it on OP Sepolia explorer by address:')
    console.warn('https://sepolia-optimism.etherscan.io/address/' + (await wallet.getAddress()))
  }
}

main().catch((e) => {
  console.error(e?.message || e)
  process.exit(1)
})