if (process.env.DB_TESTS_ALLOWED !== '1') {
  throw new Error(
    'DB testleri kapalı. Geliştirmede .env içine DB_TESTS_ALLOWED=1 yaz. Yayından sonra (M8) bu değer 0 olur; ' +
      'testler canlı restorana test fişi bastırır.');
}
