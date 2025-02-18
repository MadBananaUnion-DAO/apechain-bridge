import { create } from 'zustand';
import { produce } from 'immer';
import {
  ChainId,
  getNativeTokenInfoOrFail,
  TokenInfo,
} from '@decent.xyz/box-common';
import {
  ApeCoinMainnetEthereum,
  isTokenPairStable,
  secondsToReadableTime,
} from '../utils/utils.ts';
import { BridgeTransactionData } from '../classes/BridgeTransactionData.ts';
import { TokenTransactionData } from '../classes/TokenTransactionData.ts';
import {
  InputType,
  WARNING_PRICE_IMPACT,
  WARNING_THRESHOLD_FIVE_MINUTES,
  WARNING_THRESHOLD_PRICE_IMPACT,
} from '../utils/constants.ts';

interface PortalState {
  sourceToken: TokenTransactionData;
  destinationToken: TokenTransactionData;
  stashedToken: TokenTransactionData | undefined;
  bridgeTransactionData: BridgeTransactionData;
  tokenApprovalTxHash: string | undefined;
  /* Used to enforce token defaults until the user explicitly changes the tokens */
  hasUserUpdatedTokens: boolean;
  /* Input State */
  lastChanged: InputType;
  /** Holds the value of slippage that is used for swaps other than stables. */
  nonStableSlippage: number;
}

interface PortalActions {
  /* Source Token Methods */
  setSourceToken: (token: TokenInfo) => void;
  setSourceChainGasTokenUsdValue: (value: number) => void;
  setSourceTokenAmount: (amount: string) => void;
  setSourceTokenAmountUsd: (amount: string) => void;
  maxOutSourceToken: (userBalance: string) => void;
  /* Destination Token Methods */
  setDestinationToken: (token: TokenInfo) => void;
  setDestinationTokenAmount: (amount: string) => void;
  setDestinationTokenAmountUsd: (amount: string) => void;
  swapSourceDestination: () => void;
  setPriceImpactWarning: (priceImpact?: number) => void;
  setTxTimeWarning: (estimatedTxTime?: number) => void;
  setTokenApprovalTxHash: (txHash: string) => void;
  setStashedToken: (token: TokenTransactionData | undefined) => void;
  updateTransactionData: (
    sourceAmount: string,
    destAmount: string,
    bridgeFee: string,
    gasFee: string,
  ) => void;
  setSlippagePercentage: (slippage: number) => void;
  resetSlippage: () => void;
  /** Reset warnings, gas prices and fees, and only the last touched token amount. */
  resetTransactionData: () => void;
  /** Reset warnings, gas prices and fees, and both source/dest token amounts. */
  resetTransactionDataAndAmounts: () => void;
  setHasUserUpdatedTokens: () => void;
}

export const defaultBridgeSourceToken = ApeCoinMainnetEthereum;
export const defaultBridgeDestinationToken = getNativeTokenInfoOrFail(
  ChainId.APE,
);
export const defaultSwapSourceToken = getNativeTokenInfoOrFail(
  ChainId.ETHEREUM,
);
export const defaultSwapDestinationToken: TokenInfo = ApeCoinMainnetEthereum;

/** Set slippage to minimum to accommodate stable coin swaps. */
function setSlippageForStableSwap(
  state: PortalStore,
  shouldStoreSlippage: boolean,
) {
  if (shouldStoreSlippage) {
    state.nonStableSlippage = state.bridgeTransactionData.slippagePercentage;
  }
  state.bridgeTransactionData.slippagePercentage =
    BridgeTransactionData.STABLE_SWAP_SLIPPAGE;
}

/** Reset slippage to the value before stable coin swap. */
function setSlippageForNonStableSwap(state: PortalStore) {
  if (
    state.nonStableSlippage &&
    state.bridgeTransactionData.slippagePercentage !== state.nonStableSlippage
  ) {
    state.bridgeTransactionData.slippagePercentage = state.nonStableSlippage;
  }
}

type PortalStore = PortalState & PortalActions;
export const usePortalStore = create<PortalStore>()((set) => ({
  sourceToken: new TokenTransactionData(defaultBridgeSourceToken),
  destinationToken: new TokenTransactionData(defaultBridgeDestinationToken),
  stashedToken: undefined,
  setStashedToken: (token: TokenTransactionData | undefined) =>
    set(
      produce((state: PortalStore) => {
        state.stashedToken = token;
      }),
    ),
  bridgeTransactionData: new BridgeTransactionData(),
  destinationChain: defaultBridgeDestinationToken.chainId,
  bridgeTransaction: undefined,
  tokenApprovalTxHash: undefined,
  lastChanged: InputType.Source,
  hasUserUpdatedTokens: false,
  setHasUserUpdatedTokens: () =>
    set(
      produce((state: PortalStore) => {
        state.hasUserUpdatedTokens = true;
      }),
    ),
  /** Reset warnings, gas prices and fees, and only the last touched token amount. */
  resetTransactionData: () =>
    set(
      produce((state: PortalStore) => {
        state.bridgeTransactionData.resetTransactionData();
        // Reset amount for the "non touched" field to zero out the quote
        if (state.lastChanged == InputType.Source) {
          state.destinationToken.amount = '';
        } else {
          state.sourceToken.amount = '';
        }
      }),
    ),
  /** Reset warnings, gas prices and fees, and both source/dest token amounts. */
  resetTransactionDataAndAmounts: () =>
    set(
      produce((state: PortalStore) => {
        state.bridgeTransactionData.resetTransactionData();
        state.sourceToken.amount = '';
        state.destinationToken.amount = '';
      }),
    ),
  updateTransactionData: (
    sourceAmount: string,
    destAmount: string,
    bridgeFee: string,
    gasFee: string,
  ) =>
    set(
      produce((state: PortalStore) => {
        if (state.lastChanged !== InputType.Source) {
          state.sourceToken.amount = sourceAmount;
        }
        state.destinationToken.amount = destAmount;
        state.bridgeTransactionData.applicationFee = Number(bridgeFee);
        state.bridgeTransactionData.setApplicationFeeUsd = Number(bridgeFee);
        state.bridgeTransactionData.gasFee = Number(gasFee);
        state.bridgeTransactionData.setGasFeeUsd = Number(gasFee);
      }),
    ),
  setSourceChainGasTokenUsdValue: (value: number) =>
    set(
      produce((state: PortalStore) => {
        state.bridgeTransactionData.sourceChainGasTokenUsdValue = value;
      }),
    ),
  setSlippagePercentage: (slippage: number) =>
    set(
      produce((state: PortalStore) => {
        state.bridgeTransactionData.slippagePercentage = slippage;
        state.nonStableSlippage = slippage;
      }),
    ),
  resetSlippage: () =>
    set(
      produce((state: PortalStore) => {
        state.bridgeTransactionData.resetSlippage();
      }),
    ),
  setPriceImpactWarning: (priceImpact?: number) =>
    set(
      produce((state: PortalStore) => {
        if (!priceImpact || priceImpact < WARNING_THRESHOLD_PRICE_IMPACT) {
          state.bridgeTransactionData.priceImpactWarning = undefined;
          return;
        }
        state.bridgeTransactionData.priceImpactWarning =
          WARNING_PRICE_IMPACT(priceImpact);
      }),
    ),
  setTxTimeWarning: (estimatedTxTime?: number) => {
    set(
      produce((state: PortalStore) => {
        state.bridgeTransactionData.estimatedTxTime = estimatedTxTime;
        if (
          !estimatedTxTime ||
          estimatedTxTime < WARNING_THRESHOLD_FIVE_MINUTES
        ) {
          state.bridgeTransactionData.timeWarning = undefined;
          return;
        }
        const readableTime = secondsToReadableTime(estimatedTxTime);
        state.bridgeTransactionData.timeWarning = `The estimated waiting time to bridge is ${readableTime}.`;
      }),
    );
  },
  setTokenApprovalTxHash: (txHash: string) =>
    set(
      produce((state: PortalStore) => {
        state.tokenApprovalTxHash = txHash;
      }),
    ),
  setSourceTokenAmount: (amount: string) =>
    set(
      produce((state: PortalStore) => {
        state.sourceToken.amount = amount;
        state.lastChanged = InputType.Source;
      }),
    ),
  setSourceTokenAmountUsd: (amount: string) =>
    set(
      produce((state: PortalStore) => {
        state.sourceToken.amountUsd = amount;
      }),
    ),
  setDestinationTokenAmount: (amount: string) =>
    set(
      produce((state: PortalStore) => {
        state.destinationToken.amount = amount;
        state.lastChanged = InputType.Destination;
      }),
    ),
  setDestinationTokenAmountUsd: (amount: string) =>
    set(
      produce((state: PortalStore) => {
        state.destinationToken.amountUsd = amount;
      }),
    ),
  setSourceToken: (token: TokenInfo) =>
    set(
      produce<PortalStore>((state) => {
        const previousSourceTokenAddress = state.sourceToken.token.address;
        state.sourceToken = new TokenTransactionData(
          token,
          state.sourceToken.amount,
        );
        // Apply slippage for stable swaps
        if (
          isTokenPairStable(token.address, state.destinationToken.token.address)
        ) {
          // Only store slippage if the previous tokens were not stable
          const wasPreviousPairStable = isTokenPairStable(
            previousSourceTokenAddress,
            state.destinationToken.token.address,
          );
          setSlippageForStableSwap(state, !wasPreviousPairStable);
        } else {
          setSlippageForNonStableSwap(state);
        }
      }),
    ),
  setDestinationToken: (token: TokenInfo) =>
    set(
      produce((state: PortalStore) => {
        const previousDestTokenAddress = state.destinationToken.token.address;
        state.destinationToken = new TokenTransactionData(
          token,
          state.destinationToken.amount,
        );
        // Apply slippage for stable swaps
        if (isTokenPairStable(token.address, state.sourceToken.token.address)) {
          // Only store slippage if the previous tokens were not stable
          const wasPreviousPairStable = isTokenPairStable(
            previousDestTokenAddress,
            state.sourceToken.token.address,
          );
          setSlippageForStableSwap(state, !wasPreviousPairStable);
        } else {
          setSlippageForNonStableSwap(state);
        }
      }),
    ),
  swapSourceDestination: () => {
    set(
      produce((state: PortalStore) => {
        const currentSource = state.sourceToken;
        state.sourceToken = state.destinationToken;
        state.destinationToken = currentSource;
        state.hasUserUpdatedTokens = true;
      }),
    );
  },
  maxOutSourceToken: (userBalance: string) =>
    set(
      produce((state: PortalStore) => {
        state.sourceToken.amount = userBalance;
        state.lastChanged = InputType.Source;
      }),
    ),
  nonStableSlippage: BridgeTransactionData.DEFAULT_SLIPPAGE,
}));
