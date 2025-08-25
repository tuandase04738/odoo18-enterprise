import { patch } from "@web/core/utils/patch";
import { PosOrder } from "@point_of_sale/app/models/pos_order";

patch(PosOrder.prototype, {
    // @Override
    set_to_invoice(to_invoice) {
        if (this.company.country_id?.code === "MX" && !this.l10n_mx_edi_usage) {
            super.set_to_invoice(false);
        } else {
            super.set_to_invoice(to_invoice);
        }
    },
});
