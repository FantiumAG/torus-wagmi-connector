import Torus, {
    type TorusInpageProvider,
    type ETHEREUM_NETWORK_TYPE,
    type TorusCtorArgs,
    type TorusParams,
} from "@toruslabs/torus-embed";
import log from "loglevel";
import { type Address, type Chain, SwitchChainError, getAddress } from "viem";
import { type CreateConnectorFn, createConnector } from "wagmi";

export interface TorusConnectorOptions {
    chains: Chain[];
    options: TorusCtorArgs & {
        host: ETHEREUM_NETWORK_TYPE | string;
        /**
         * ChainId in hex/number that you want to connect with.
         */
        chainId?: number;
        TorusParams?: Omit<TorusParams, "network">;
    };
}

export default function torusConnector({
    chains,
    options,
}: TorusConnectorOptions) {
    let __torus: Torus | undefined;
    let network:
        | {
              host: string;
              chainId: number;
              networkName: string;
              tickerName: string;
              ticker: string;
              blockExplorer: string;
          }
        | undefined;

    const isChainUnsupported = (chainId: number): boolean => {
        return !chains.some((x) => x.id === chainId);
    };

    const getTorus = () => {
        if (!__torus) {
            throw new Error("Torus instance not initialized");
        }

        return __torus;
    };

    const factory: CreateConnectorFn<TorusInpageProvider> = (config) => ({
        id: "torus",
        name: "Torus",
        type: "torus" as const,

        async setup() {
            const chainId = options.chainId ? options.chainId : 1;
            const host = options.host ? options.host : "mainnet";
            __torus = new Torus({
                buttonPosition: options.buttonPosition || "bottom-left",
                modalZIndex: 9999999999999,
                apiKey: options.apiKey,
                buttonSize: options.buttonSize,
            });

            // set network according to chain details provided
            const chain = chains.find((x) => x.id === chainId);

            if (chain) {
                network = {
                    host,
                    chainId,
                    networkName: chain.name,
                    tickerName: chain.nativeCurrency?.name,
                    ticker: chain.nativeCurrency?.symbol,
                    blockExplorer: chain.blockExplorers?.default?.url || "",
                };
            } else {
                log.warn(`ChainId ${chainId} not found in chain list`);
            }
        },

        async connect(params) {
            const chainId = params?.chainId;
            const provider = await this.getProvider();

            if (!getTorus().isLoggedIn) {
                await getTorus().login();
            }

            provider.on("accountsChanged", this.onAccountsChanged);
            provider.on("chainChanged", this.onChainChanged);

            const [accounts, connectedChainId] = await Promise.all([
                this.getAccounts(),
                this.getChainId(),
            ]);
            let unsupported = isChainUnsupported(connectedChainId);
            let id = connectedChainId;

            if (
                chainId &&
                connectedChainId !== chainId &&
                typeof this.switchChain === "function"
            ) {
                // try switching chain
                const chain = await this.switchChain({ chainId });
                id = chain.id;
                unsupported = isChainUnsupported(id);
            }

            if (unsupported) {
                throw new SwitchChainError(
                    new Error("chain not found on connector."),
                );
            }

            return {
                accounts,
                chainId: id,
            };
        },

        async disconnect() {
            if (__torus) {
                await __torus.logout();
            }
        },

        async getAccounts() {
            const provider = await this.getProvider();
            const raw = await provider.request<string[]>({
                method: "eth_accounts",
            });

            if (!raw || raw.length === 0) {
                return [];
            }

            return raw.reduce<Address[]>((acc, address) => {
                if (address) {
                    acc.push(getAddress(address));
                }

                return acc;
            }, []);
        },

        async getChainId() {
            const provider = await this.getProvider();
            const chainId = await provider.request<string>({
                method: "eth_chainId",
            });
            log.info("chainId", chainId);
            return Number(chainId);
        },

        async getProvider() {
            const torusInstance = getTorus();

            // initialize torus embed
            if (!torusInstance.isInitialized) {
                await torusInstance.init({
                    ...options.TorusParams,
                    network,
                });
            }
            if (options.TorusParams?.showTorusButton !== false) {
                torusInstance.showTorusButton();
            }

            return torusInstance.provider as TorusInpageProvider;
        },

        async isAuthorized() {
            try {
                const provider = await this.getProvider();
                const accounts = await this.getAccounts();
                return accounts.length > 0 && !!provider;
            } catch {
                return false;
            }
        },

        async switchChain({ chainId }) {
            // supports addEthereumChainParameter
            try {
                const chain = chains.find((x) => x.id === chainId);
                if (!chain) {
                    throw new SwitchChainError(
                        new Error("chain not found on connector."),
                    );
                }

                if (!this.isAuthorized()) {
                    throw new Error("Please login first");
                }

                const torusInstance = getTorus();
                await torusInstance.setProvider({
                    host: chain.rpcUrls.default.http[0] || "",
                    chainId,
                    networkName: chain.name,
                });
                return chain;
            } catch (error: unknown) {
                log.error("Error: Cannot change chain", error);
                throw new SwitchChainError(error as Error);
            }
        },

        onAccountsChanged(accounts: string[]) {
            if (accounts.length === 0 || !accounts[0]) {
                config.emitter.emit("disconnect");
            } else {
                config.emitter.emit("change", {
                    accounts: [getAddress(accounts[0])],
                });
            }
        },

        async onChainChanged(chainId: string) {
            const id = Number(chainId);
            const unsupported = isChainUnsupported(id);
            log.info("chainChanged", id, unsupported);
            config.emitter.emit("change", { chainId: id });
        },

        async onConnect(connectInfo) {
            const accounts = await this.getAccounts();
            const chainId = Number(connectInfo.chainId);

            config.emitter.emit("connect", { accounts, chainId });
        },

        onDisconnect() {
            config.emitter.emit("disconnect");
        },
    });

    return createConnector(factory);
}
