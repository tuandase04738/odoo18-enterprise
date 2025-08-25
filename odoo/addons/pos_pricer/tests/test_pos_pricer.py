# Part of Odoo. See LICENSE file for full copyright and licensing details

from odoo.tests import Form, tagged, TransactionCase


@tagged('post_install', '-at_install')
class TestPricerDisplayPrice(TransactionCase):
    def test_pricer_display_price_compute(self):
        """ Ensure the compute method sets a default value to avoid crash. """
        product_form = Form(self.env['product.product'])
        product_form.name = "Test Product"
        product = product_form.save()
        display_price = product.pricer_display_price
        self.assertIsInstance(display_price, str)
        self.assertEqual(display_price, '')
