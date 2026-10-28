export async function getSystemFinancialBalanceForUpdate(connection, accountCode) {
    const [accounts] = await connection.query('SELECT current_balance FROM system_financial_accounts WHERE account_code = ? FOR UPDATE', [accountCode]);
    if (accounts.length === 0) {
        throw new Error(`Không tìm thấy tài khoản tài chính ${accountCode}. Hãy chạy migration quản trị.`);
    }
    return Number(accounts[0].current_balance);
}
export async function recordSystemFinancialTransaction(connection, transaction) {
    if (!Number.isFinite(transaction.amount) || transaction.amount === 0) {
        throw new Error('Số tiền giao dịch tài chính không hợp lệ.');
    }
    const balance = await getSystemFinancialBalanceForUpdate(connection, transaction.accountCode);
    if (balance + transaction.amount < -0.001) {
        throw new Error(`Số dư ${transaction.accountCode} không đủ để ghi nhận giao dịch.`);
    }
    await connection.query('UPDATE system_financial_accounts SET current_balance = current_balance + ? WHERE account_code = ?', [transaction.amount, transaction.accountCode]);
    await connection.query(`INSERT INTO system_financial_transactions
     (account_code, admin_user_id, transaction_type, amount, reference_code, description)
     VALUES (?, ?, ?, ?, ?, ?)`, [
        transaction.accountCode,
        transaction.adminUserId ?? null,
        transaction.transactionType,
        transaction.amount,
        transaction.referenceCode ?? null,
        transaction.description ?? null,
    ]);
    return balance + transaction.amount;
}
