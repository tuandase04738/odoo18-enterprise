# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import date

from odoo.tests import tagged

from odoo.addons.hr_payroll_account.tests.common import TestPayslipValidationCommon


@tagged('post_install', 'post_install_l10n', '-at_install', 'payslips_validation')
class TestPayslipValidation(TestPayslipValidationCommon):

    @classmethod
    @TestPayslipValidationCommon.setup_country('ae')
    def setUpClass(cls):
        super().setUpClass()
        cls._setup_common(
            country=cls.env.ref('base.ae'),
            structure=cls.env.ref('l10n_ae_hr_payroll.uae_employee_payroll_structure'),
            structure_type=cls.env.ref('l10n_ae_hr_payroll.uae_employee_payroll_structure_type'),
            contract_fields={
                'wage': 40000.0,
                'l10n_ae_housing_allowance': 400.0,
                'l10n_ae_transportation_allowance': 220.0,
                'l10n_ae_other_allowances': 100.0,
                'l10n_ae_is_dews_applied': True,
            }
        )

    def test_payslip_1(self):
        payslip = self._generate_payslip(date(2024, 1, 1), date(2024, 1, 31))
        payslip_results = {'BASIC': 40000.0, 'HOUALLOW': 400.0, 'TRAALLOW': 220.0, 'OTALLOW': 100.0, 'EOSP': 3333.33, 'ALP': 3393.33, 'GROSS': 40720.0, 'SICC': 5090.0, 'SIEC': -2036.0, 'DEWS': -3332.0, 'NET': 35352.0}
        self._validate_payslip(payslip, payslip_results)

    def test_payslip_2(self):
        payslip = self._generate_payslip(date(2024, 1, 1), date(2024, 1, 31))
        self._add_other_inputs(payslip, {
            'l10n_ae_hr_payroll.input_salary_arrears': 1000.0,
            'l10n_ae_hr_payroll.input_other_earnings': 2000.0,
            'l10n_ae_hr_payroll.input_salary_deduction': 500.0,
            'l10n_ae_hr_payroll.input_other_deduction': 200.0,
            'l10n_ae_hr_payroll.l10n_ae_input_overtime_allowance': 300,
            'l10n_ae_hr_payroll.input_bonus_earnings': 400,
            'l10n_ae_hr_payroll.l10n_ae_input_other_allowance': 600,
            'l10n_ae_hr_payroll.input_airfare_allowance_earnings': 700,
        })
        payslip_results = {'BASIC': 40000.0, 'HOUALLOW': 400.0, 'TRAALLOW': 220.0, 'OTALLOW': 100.0, 'SALARY_ARREARS': 1000.0, 'OTHER_EARNINGS': 2000.0, 'SALARY_DEDUCTIONS': -500.0, 'OTHER_DEDUCTIONS': -200.0, 'OVERTIMEALLOWINP': 300.0, 'BONUS': 400.0, 'OTALLOWINP': 600.0, 'AIRFARE_ALLOWANCE': 700.0, 'EOSP': 3333.33, 'ALP': 3393.33, 'GROSS': 45720.0, 'SICC': 5090.0, 'SIEC': -2036.0, 'DEWS': -3332.0, 'NET': 39652.0}
        self._validate_payslip(payslip, payslip_results)

    def test_end_of_service_salary_rule_1(self):
        """
        Test the end of service salary rule calculation.
        The rule should consider the full 30 days compensation after completing the 6th year, not the 5th.
        """
        employee_1 = self.env['hr.employee'].create({
            'name': 'Test Employee 1',
        })
        contract_1 = self.env['hr.contract'].create({
            'name': 'Test Contract 1',
            'employee_id': employee_1.id,
            'wage': 15_000.0,
            'state': 'open',
            'date_start': date(2014, 6, 4),
        })

        departure_notice_1 = self.env['hr.departure.wizard'].create({
            'employee_id': employee_1.id,
            'departure_date': date(2017, 2, 19),
            'departure_description': 'foo',
        })
        departure_notice_1.with_context(toggle_active=True).action_register_departure()

        payslip_1 = self._generate_payslip(
            date(2017, 2, 1),
            date(2017, 2, 28),
            employee_id=employee_1.id,
            contract_id=contract_1.id,
        )

        self.assertEqual(payslip_1._get_line_values(['EOS'])['EOS'][payslip_1.id]['total'], 28_432.0, "End of Service calculation is incorrect")

    def test_end_of_service_salary_rule_2(self):
        employee_2 = self.env['hr.employee'].create({
            'name': 'Test Employee 1',
        })
        contract_2 = self.env['hr.contract'].create({
            'name': 'Test Contract 1',
            'employee_id': employee_2.id,
            'wage': 15_000.0,
            'state': 'open',
            'date_start': date(2019, 7, 22),
        })

        departure_notice_2 = self.env['hr.departure.wizard'].create({
            'employee_id': employee_2.id,
            'departure_date': date(2025, 1, 8),
            'departure_description': 'foo',
        })
        departure_notice_2.with_context(toggle_active=True).action_register_departure()

        payslip_2 = self._generate_payslip(
            date(2025, 1, 1),
            date(2025, 1, 31),
            employee_id=employee_2.id,
            contract_id=contract_2.id,
        )

        self.assertEqual(payslip_2._get_line_values(['EOS'])['EOS'][payslip_2.id]['total'], 57_365.0, "End of Service calculation is incorrect")

    def test_end_of_service_salary_rule_3(self):
        employee_3 = self.env['hr.employee'].create({
            'name': 'Test Employee 1',
        })
        contract_3 = self.env['hr.contract'].create({
            'name': 'Test Contract 1',
            'employee_id': employee_3.id,
            'wage': 15_000.0,
            'state': 'open',
            'date_start': date(2018, 7, 22),
        })

        departure_notice_3 = self.env['hr.departure.wizard'].create({
            'employee_id': employee_3.id,
            'departure_date': date(2025, 1, 8),
            'departure_description': 'foo',
        })
        departure_notice_3.with_context(toggle_active=True).action_register_departure()

        payslip_3 = self._generate_payslip(
            date(2025, 1, 1),
            date(2025, 1, 31),
            employee_id=employee_3.id,
            contract_id=contract_3.id,
        )

        self.assertEqual(payslip_3._get_line_values(['EOS'])['EOS'][payslip_3.id]['total'], 74_449.0, "End of Service calculation is incorrect")
