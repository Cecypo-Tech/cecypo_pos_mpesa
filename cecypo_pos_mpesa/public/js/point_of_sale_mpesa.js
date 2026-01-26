// Point of Sale - Mpesa Quick Pay Integration
// Adds "Quick Pay - Mpesa" button to the POS interface

(function() {
    console.log('🟢 Mpesa POS Integration: Loading...');

    let buttonInjected = false;

    // Function to inject the Mpesa button
    function injectMpesaButton() {
        // Check if cur_pos and payment component exist
        if (typeof cur_pos === 'undefined' || !cur_pos.payment || !cur_pos.payment.$payment_modes) {
            return false;
        }

        // Check if button already exists
        if ($('.mpesa-quick-pay-btn').length > 0) {
            console.log('⚠️  Mpesa button already exists');
            return true;
        }

        const company = cur_pos.frm?.doc?.company;
        if (!company) {
            console.log('⚠️  No company found yet');
            return false;
        }

        console.log('✓ POS payment component found, checking Mpesa availability...');

        // Check if Mpesa is available for this company
        frappe.call({
            method: 'cecypo_pos_mpesa.api.pos_quick_pay_mpesa_process',
            args: {
                action: 'check_mpesa_available',
                company: company
            },
            callback(r) {
                if (r.message && r.message.available) {
                    console.log('✓ Mpesa is available, injecting button...');
                    addMpesaButton();
                } else {
                    console.log('⚠️  Mpesa not available for company:', company);
                }
            }
        });

        return true;
    }

    // Function to add the button to the DOM
    function addMpesaButton() {
        if (!cur_pos || !cur_pos.payment || !cur_pos.payment.$payment_modes) {
            console.log('❌ Payment component not available');
            return;
        }

        // Check again if button exists
        if ($('.mpesa-quick-pay-btn').length > 0) {
            return;
        }

        // Inject the button HTML
        cur_pos.payment.$payment_modes.before(`
            <div class="mpesa-quick-pay-section">
                <button class="btn btn-success btn-sm mpesa-quick-pay-btn">
                    <i class="fa fa-mobile"></i> ${__('Quick Pay - Mpesa')}
                </button>
            </div>
        `);

        // Bind click event
        $('.mpesa-quick-pay-btn').on('click', function() {
            showMpesaQuickPayDialog();
        });

        // Inject styles
        injectMpesaStyles();

        buttonInjected = true;
        console.log('✓ Mpesa Quick Pay button added successfully!');
    }

    // Function to show the Mpesa dialog
    function showMpesaQuickPayDialog() {
        const frm = cur_pos.frm;
        const outstanding = flt(frm.doc.outstanding_amount || 0);

        if (outstanding <= 0) {
            frappe.msgprint(__('No outstanding amount to pay'));
            return;
        }

        const dialog = new frappe.ui.Dialog({
            title: __('Quick Pay - Mpesa'),
            size: 'large',
            fields: [
                { fieldtype: 'HTML', fieldname: 'payment_summary', options: getMpesaSummaryHtml(frm, outstanding) },
                { fieldtype: 'Section Break', label: __('Select Mpesa Payments') },
                { fieldtype: 'HTML', fieldname: 'mpesa_list' },
                { fieldtype: 'Section Break' },
                { fieldtype: 'HTML', fieldname: 'mpesa_totals' }
            ],
            primary_action_label: __('Add Payments'),
            primary_action: () => {
                processMpesaPayments(frm, dialog, outstanding);
            },
            secondary_action_label: __('Request Payment'),
            secondary_action: () => {
                showRequestPaymentDialog(frm);
            }
        });

        dialog.selected_mpesa = [];
        dialog.outstanding = outstanding;
        dialog.currency = frm.doc.currency;
        dialog.company = frm.doc.company;
        dialog.search_term = '';
        dialog.mpesa_data = {count: 0, payments: []};

        dialog.$wrapper.find('.modal-dialog').css('max-width', '800px');
        dialog.show();
        injectMpesaDialogStyles();

        // Load payments
        dialog.fields_dict.mpesa_list.$wrapper.html(
            `<div class="text-center text-muted p-4"><i class="fa fa-spinner fa-spin"></i> ${__('Loading...')}</div>`
        );

        loadMpesaPayments(dialog, '');
    }

    function getMpesaSummaryHtml(frm, outstanding) {
        const paid = flt(frm.doc.paid_amount || 0);
        const total = flt(frm.doc.grand_total || 0);
        const percent = total > 0 ? Math.round((paid / total) * 100) : 0;

        return `
            <div class="mpesa-pay-header">
                <div class="mpesa-header-icon">
                    <i class="fa fa-mobile"></i>
                </div>
                <div class="mpesa-header-info">
                    <div class="mpesa-row">
                        <span>${__('Customer')}</span>
                        <strong>${frm.doc.customer_name || frm.doc.customer}</strong>
                    </div>
                    <div class="mpesa-row">
                        <span>${__('Grand Total')}</span>
                        <strong>${format_currency(total, frm.doc.currency)}</strong>
                    </div>
                    <div class="mpesa-row">
                        <span>${__('Already Paid')}</span>
                        <strong class="text-success">${format_currency(paid, frm.doc.currency)} <small>(${percent}%)</small></strong>
                    </div>
                    <div class="mpesa-row mpesa-outstanding">
                        <span>${__('Outstanding')}</span>
                        <strong>${format_currency(outstanding, frm.doc.currency)}</strong>
                    </div>
                </div>
            </div>
        `;
    }

    function loadMpesaPayments(dialog, search) {
        frappe.call({
            method: 'cecypo_pos_mpesa.api.pos_quick_pay_mpesa_process',
            args: {
                action: 'get_mpesa_payments',
                company: dialog.company,
                search: search || ''
            },
            callback: (r) => {
                dialog.mpesa_data = r.message || {count: 0, payments: []};
                renderMpesaList(dialog);
                updateMpesaTotals(dialog);
            }
        });
    }

    function renderMpesaList(dialog) {
        const wrapper = dialog.fields_dict.mpesa_list.$wrapper;
        const data = dialog.mpesa_data || {};
        const count = data.count || 0;
        const payments = data.payments || [];

        if (count === 0) {
            wrapper.html(`
                <div class="mpesa-empty-state">
                    <i class="fa fa-inbox fa-3x text-muted"></i>
                    <p class="mt-3">${__('No pending Mpesa payments found')}</p>
                </div>
            `);
            return;
        }

        let html = `
            <div class="mpesa-search-section">
                <div class="mpesa-search-box">
                    <i class="fa fa-search mpesa-search-icon"></i>
                    <input type="text" class="form-control" id="mpesa-search"
                           placeholder="${__('Search name, phone, transaction ID (min 3 chars)...')}"
                           value="${dialog.search_term || ''}">
                </div>
                <div class="mpesa-count-badge">
                    <i class="fa fa-mobile"></i>
                    <span><strong>${count}</strong> ${__('pending')}</span>
                </div>
            </div>
            <div class="mpesa-payments-list">
        `;

        if (payments.length === 0 && dialog.search_term && dialog.search_term.length >= 3) {
            html += `<div class="mpesa-no-results"><i class="fa fa-search text-muted"></i><p>${__('No matches')}</p></div>`;
        } else if (payments.length === 0) {
            html += `<div class="mpesa-search-prompt"><i class="fa fa-hand-o-up text-muted"></i><p>${__('Search above')}</p></div>`;
        } else {
            html += `
                <div class="mpesa-results-header">
                    <label class="mpesa-checkbox-label">
                        <input type="checkbox" id="mpesa-select-all">
                        <span>${__('Select All')} (${payments.length})</span>
                    </label>
                </div>
            `;

            const today = frappe.datetime.get_today();
            for (const p of payments) {
                const amount = flt(p.transamount || 0);
                const is_exact = Math.abs(amount - dialog.outstanding) < 0.01;
                const is_selected = dialog.selected_mpesa.some(x => x.name === p.name);

                html += `
                    <div class="mpesa-payment-item ${is_selected ? 'selected' : ''} ${is_exact ? 'exact-match' : ''}">
                        <input type="checkbox" class="mpesa-item-check" data-name="${p.name}" data-amount="${amount}" ${is_selected ? 'checked' : ''}>
                        <div class="mpesa-item-info">
                            <div><strong>${p.full_name || 'Unknown'}</strong> <span class="mpesa-amount">${format_currency(amount, dialog.currency)}</span></div>
                            <div class="mpesa-item-secondary">
                                <span><i class="fa fa-phone"></i> ${p.msisdn || ''}</span>
                                <span><i class="fa fa-exchange"></i> ${p.transid || p.name}</span>
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        html += '</div>';
        wrapper.html(html);

        // Bind events
        let search_timeout;
        wrapper.find('#mpesa-search').on('input', function() {
            const search = $(this).val().trim();
            clearTimeout(search_timeout);
            if (search.length >= 3 || search.length === 0) {
                search_timeout = setTimeout(() => {
                    dialog.search_term = search;
                    loadMpesaPayments(dialog, search);
                }, 300);
            }
        });

        wrapper.find('#mpesa-select-all').on('change', function() {
            wrapper.find('.mpesa-item-check').prop('checked', $(this).is(':checked')).trigger('change');
        });

        wrapper.find('.mpesa-item-check').on('change', function() {
            const name = $(this).data('name');
            const amount = flt($(this).data('amount'));
            const checked = $(this).is(':checked');

            if (checked) {
                if (!dialog.selected_mpesa.find(x => x.name === name)) {
                    dialog.selected_mpesa.push({ name, amount });
                }
            } else {
                dialog.selected_mpesa = dialog.selected_mpesa.filter(x => x.name !== name);
            }

            $(this).closest('.mpesa-payment-item').toggleClass('selected', checked);
            updateMpesaTotals(dialog);
        });
    }

    function updateMpesaTotals(dialog) {
        const wrapper = dialog.fields_dict.mpesa_totals.$wrapper;
        const total_selected = dialog.selected_mpesa.reduce((sum, p) => sum + flt(p.amount), 0);
        const remaining = dialog.outstanding - total_selected;

        wrapper.html(`
            <div class="mpesa-totals-bar">
                <div class="mpesa-total-item">
                    <span>${__('Selected')}</span>
                    <strong>${dialog.selected_mpesa.length} ${__('payment(s)')}</strong>
                </div>
                <div class="mpesa-total-item">
                    <span>${__('Total Amount')}</span>
                    <strong>${format_currency(total_selected, dialog.currency)}</strong>
                </div>
                <div class="mpesa-total-item">
                    <span>${__('Remaining')}</span>
                    <strong class="${remaining > 0 ? 'text-warning' : 'text-success'}">${format_currency(Math.max(0, remaining), dialog.currency)}</strong>
                </div>
            </div>
        `);
    }

    function processMpesaPayments(frm, dialog, outstanding) {
        if (!dialog.selected_mpesa.length) {
            frappe.msgprint(__('Please select at least one payment'));
            return;
        }

        const mpesa_names = dialog.selected_mpesa.map(p => p.name).join(',');

        frappe.call({
            method: 'cecypo_pos_mpesa.api.pos_quick_pay_mpesa_process',
            args: {
                action: 'process_mpesa',
                pos_invoice: frm.doc.name,
                customer: frm.doc.customer,
                mpesa_payments: mpesa_names,
                outstanding_amount: outstanding,
                auto_save: 1,
                auto_submit: 0
            },
            freeze: true,
            freeze_message: __('Processing...'),
            callback: (r) => {
                if (r.message && r.message.success) {
                    dialog.hide();
                    frappe.msgprint({
                        title: __('Success'),
                        message: __('Mpesa payments added successfully'),
                        indicator: 'green'
                    });

                    // Reload and refresh POS
                    frm.reload_doc().then(() => {
                        if (cur_pos && cur_pos.payment) {
                            cur_pos.payment.render_payment_section();
                        }
                    });
                }
            }
        });
    }

    function showRequestPaymentDialog(frm) {
        frappe.call({
            method: 'cecypo_pos_mpesa.api.pos_quick_pay_mpesa_process',
            args: {
                action: 'get_customer_phone',
                customer: frm.doc.customer
            },
            callback: (r) => {
                const phone = r.message || '';
                const outstanding = flt(frm.doc.outstanding_amount || 0);

                const req_dialog = new frappe.ui.Dialog({
                    title: __('Request Mpesa Payment'),
                    fields: [
                        {
                            fieldtype: 'Data',
                            fieldname: 'phone_number',
                            label: __('Phone Number'),
                            reqd: 1,
                            default: phone
                        }
                    ],
                    primary_action_label: __('Send Request'),
                    primary_action: (values) => {
                        frappe.call({
                            method: 'cecypo_pos_mpesa.api.pos_quick_pay_mpesa_process',
                            args: {
                                action: 'create_payment_request',
                                pos_invoice: frm.doc.name,
                                customer: frm.doc.customer,
                                phone_number: values.phone_number,
                                amount: outstanding
                            },
                            freeze: true,
                            callback: (r) => {
                                if (r.message && r.message.success) {
                                    req_dialog.hide();
                                    frappe.msgprint({
                                        title: __('Request Sent'),
                                        message: __('Payment request sent to ') + values.phone_number,
                                        indicator: 'green'
                                    });
                                }
                            }
                        });
                    }
                });
                req_dialog.show();
            }
        });
    }

    function injectMpesaStyles() {
        if (document.getElementById('mpesa-pos-styles')) return;

        $(`<style id="mpesa-pos-styles">
            .mpesa-quick-pay-section {
                padding: 10px 15px;
                background: var(--bg-color);
                border-bottom: 1px solid var(--border-color);
            }
            .mpesa-quick-pay-btn {
                width: 100%;
                padding: 8px 16px;
                background: linear-gradient(135deg, #00a650 0%, #007a3d 100%);
                border: none;
                color: white;
                font-weight: 500;
                font-size: 14px;
                border-radius: 6px;
            }
            .mpesa-quick-pay-btn:hover {
                background: linear-gradient(135deg, #008f45 0%, #006632 100%);
                transform: translateY(-1px);
                box-shadow: 0 4px 8px rgba(0, 166, 80, 0.3);
            }
        </style>`).appendTo('head');
    }

    function injectMpesaDialogStyles() {
        if (document.getElementById('mpesa-dialog-styles')) return;

        $(`<style id="mpesa-dialog-styles">
            .mpesa-pay-header {
                background: linear-gradient(135deg, #00a650 0%, #007a3d 100%);
                border-radius: 10px;
                padding: 16px 20px;
                color: white;
                margin-bottom: 12px;
                display: flex;
                gap: 16px;
            }
            .mpesa-header-icon { font-size: 2.5em; }
            .mpesa-header-info { flex: 1; }
            .mpesa-row { display: flex; justify-content: space-between; padding: 4px 0; }
            .mpesa-row:not(:last-child) { border-bottom: 1px solid rgba(255,255,255,0.15); }
            .mpesa-outstanding { font-size: 1.15em; padding-top: 8px; }

            .mpesa-search-section {
                display: flex;
                gap: 12px;
                background: var(--bg-color);
                border: 1px solid var(--border-color);
                border-radius: 10px;
                padding: 10px 14px;
                margin-bottom: 12px;
            }
            .mpesa-search-box {
                flex: 1;
                position: relative;
            }
            .mpesa-search-box input {
                padding-left: 32px;
                height: 36px;
                width: 100%;
            }
            .mpesa-search-icon {
                position: absolute;
                left: 10px;
                top: 50%;
                transform: translateY(-50%);
                color: var(--text-muted);
            }
            .mpesa-count-badge {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 12px;
                background: rgba(0, 166, 80, 0.1);
                border-radius: 6px;
                color: #00a650;
            }

            .mpesa-payments-list {
                max-height: 280px;
                overflow-y: auto;
                border: 1px solid var(--border-color);
                border-radius: 8px;
            }
            .mpesa-results-header {
                padding: 8px 12px;
                background: var(--bg-color);
                border-bottom: 1px solid var(--border-color);
                position: sticky;
                top: 0;
            }
            .mpesa-payment-item {
                display: flex;
                gap: 10px;
                padding: 10px 12px;
                border-bottom: 1px solid var(--border-color);
                cursor: pointer;
            }
            .mpesa-payment-item:hover { background: var(--bg-color); }
            .mpesa-payment-item.selected { background: rgba(0, 166, 80, 0.08); }
            .mpesa-payment-item.exact-match { border-left: 3px solid #00a650; }
            .mpesa-item-info { flex: 1; }
            .mpesa-item-secondary { font-size: 11px; color: var(--text-muted); display: flex; gap: 10px; }
            .mpesa-amount { color: #00a650; font-weight: 600; float: right; }

            .mpesa-totals-bar {
                display: flex;
                gap: 20px;
                padding: 12px 14px;
                background: var(--bg-color);
                border-radius: 8px;
                border: 1px solid var(--border-color);
            }
            .mpesa-total-item { display: flex; flex-direction: column; }
            .mpesa-total-item span { font-size: 10px; color: var(--text-muted); }

            .mpesa-empty-state, .mpesa-no-results, .mpesa-search-prompt {
                text-align: center;
                padding: 30px 20px;
                color: var(--text-muted);
            }
            .mpesa-checkbox-label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
        </style>`).appendTo('head');
    }

    // Watch for payment component and inject button
    function watchForPaymentComponent() {
        if (injectMpesaButton()) {
            console.log('✓ Button injection attempt completed');
            return;
        }

        // Try again in 500ms
        setTimeout(watchForPaymentComponent, 500);
    }

    // Start watching when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', watchForPaymentComponent);
    } else {
        watchForPaymentComponent();
    }

    console.log('✓ Mpesa POS Integration script loaded');
})();
