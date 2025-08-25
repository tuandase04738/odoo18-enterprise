import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/store/pos_store";
import { _t } from "@web/core/l10n/translation";

patch(PosStore.prototype, {
    /**
     * @override
     */
    async setup() {
        await super.setup(...arguments);
        this.delivery_order_count = {};
        const storedToggleState =
            JSON.parse(localStorage.getItem("toggle_state_" + this.config.id)) || {};
        const toggleState = {};
        this.config.urbanpiper_delivery_provider_ids.forEach((provider) => {
            toggleState[provider.technical_name] =
                provider.technical_name in storedToggleState
                    ? storedToggleState[provider.technical_name]
                    : true;
        });
        localStorage.setItem("toggle_state_" + this.config.id, JSON.stringify(toggleState));
        this.toggleState = {
            enableProviders:
                JSON.parse(localStorage.getItem("toggle_state_" + this.config.id)) || {},
        };
        this.data.connectWebSocket("DELIVERY_ORDER_COUNT", async (order_id) => {
            await this._fetchUrbanpiperOrderCount(order_id);
        });
        this.data.connectWebSocket("STORE_ACTION", async (data) => {
            await this._fetchStoreAction(data);
        });
        if (this.config.module_pos_urban_piper && this.config.urbanpiper_store_identifier) {
            await this._fetchUrbanpiperOrderCount(false);
        }
    },

    async updateStoreStatus(status = false, providerName = false) {
        if (this.config.module_pos_urban_piper && this.config.urbanpiper_store_identifier) {
            await this.data.call("pos.config", "update_store_status", [this.config.id, status], {
                context: {
                    providerName: providerName,
                },
            });
            if (status) {
                localStorage.setItem(
                    "toggle_state_" + this.config.id,
                    JSON.stringify(this.toggleState.enableProviders)
                );
            }
        }
    },

    async closePos() {
        await this.updateStoreStatus();
        localStorage.removeItem("toggle_state_" + this.config.id);
        return super.closePos();
    },

    async getServerOrders() {
        if (this.config.module_pos_urban_piper && this.config.urbanpiper_store_identifier) {
            return await this.loadServerOrders([
                ["company_id", "=", this.config.company_id.id],
                [
                    "delivery_provider_id",
                    "in",
                    this.config.urbanpiper_delivery_provider_ids.map((provider) => provider.id),
                ],
            ]);
        } else {
            return await super.getServerOrders(...arguments);
        }
    },

    _fetchStoreAction(data) {
        const params = {
            type: "success",
            sticky: false,
        };
        let message = "";

        // Initialize or get existing toggle state from localStorage
        const storageKey = "toggle_state_" + this.config.id;
        const toggleState = JSON.parse(localStorage.getItem(storageKey)) || {};
        if (data.status) {
            toggleState[data.platform] = data.action === "enable";
        }
        localStorage.setItem(storageKey, JSON.stringify(toggleState));

        this.toggleState = {
            enableProviders: toggleState,
        };

        // Prepare notification message
        if (!data.status) {
            params.type = "danger";
            message = _t("Error occurred while updating " + data.platform + " status.");
        } else if (data.action === "enable") {
            message = _t(this.config.name + " is online on " + data.platform + ".");
        } else if (data.action === "disable") {
            message = _t(this.config.name + " is offline on " + data.platform + ".");
        }

        if (message) {
            this.notification.add(message, params);
        }
    },

    async _fetchUrbanpiperOrderCount(order_id) {
        try {
            await this.getServerOrders();
        } catch {
            this.notification.add(_t("Order does not load from server"), {
                type: "warning",
                sticky: false,
            });
        }
        const response = await this.data.call(
            "pos.config",
            "get_delivery_data",
            [this.config.id],
            {}
        );
        this.delivery_order_count = response.delivery_order_count;
        this.delivery_providers = response.delivery_providers;
        this.total_new_order = response.total_new_order || 0;
        const deliveryOrder = order_id ? this.models["pos.order"].get(order_id) : false;
        if (!deliveryOrder) {
            return;
        }
        if (deliveryOrder.delivery_status === "acknowledged") {
            if (!deliveryOrder.isFutureOrder()) {
                await this.sendOrderInPreparationUpdateLastChange(deliveryOrder);
            }
        } else if (deliveryOrder.delivery_status === "placed") {
            this.sound.play("notification");
            this.notification.add(_t("New online order received."), {
                type: "success",
                sticky: false,
                buttons: [
                    {
                        name: _t("Review Orders"),
                        onClick: () => {
                            const stateOverride = {
                                search: {
                                    fieldName: "DELIVERYPROVIDER",
                                    searchTerm: deliveryOrder?.delivery_provider_id.name,
                                },
                                filter: "ACTIVE_ORDERS",
                            };
                            this.set_order(deliveryOrder);
                            if (this.mainScreen.component?.name == "TicketScreen") {
                                this.env.services.ui.block();
                                if (this.config.module_pos_restaurant) {
                                    this.showScreen("FloorScreen");
                                } else {
                                    this.showScreen("ProductScreen");
                                }
                                setTimeout(() => {
                                    this.showScreen("TicketScreen", { stateOverride });
                                    this.env.services.ui.unblock();
                                }, 300);
                                return;
                            }
                            return this.showScreen("TicketScreen", { stateOverride });
                        },
                    },
                ],
            });
        }
    },

    /**
     * @override
     */
    addOrderIfEmpty() {
        if (
            !this.get_order() ||
            (this.get_order().delivery_identifier && this.get_order().state == "paid")
        ) {
            this.add_new_order();
            return;
        }
        return super.addOrderIfEmpty(...arguments);
    },

    async goToBack() {
        this.addPendingOrder([this.selectedOrder.id]);
        await this.syncAllOrders();
        this.showScreen("TicketScreen");
        if (this.selectedOrder.delivery_status !== "placed") {
            try {
                await this.checkPreparationStateAndSentOrderInPreparation(this.selectedOrder);
            } catch {
                this.notification.add(_t("Error to send in preparation display."), {
                    type: "warning",
                    sticky: false,
                });
            }
        }
    },

    getPrintingChanges(order, diningModeUpdate) {
        let changes = super.getPrintingChanges(order, diningModeUpdate);
        if (order.delivery_provider_id) {
            changes = {
                ...changes,
                delivery_provider_id: order.delivery_provider_id,
                order_otp: JSON.parse(order.delivery_json)?.order?.details?.ext_platforms?.[0].id,
                prep_time: order.prep_time,
            };
        }
        return changes;
    },
});
