/**
 * Fixed test vectors for the release envelope, format v1
 * (`docs/security/release-envelope-2026-10-26.md`). Every value is synthetic:
 * the owner and recipient are the release-identity vectors' Alice and Bob
 * (`testVectors.ts`), and every other input is a byte range (0x10, 0x11, …),
 * so the known-answer tests can be reproduced and nothing here is, or
 * protects, anything real. Not exported from the package index, so they stay
 * out of application bundles; tests import this file by path.
 *
 * How they were made: the content with `encryptReleaseContentWith` under the
 * fixed content key and nonce (padding is deterministic); each copy with
 * `sealReleaseCopyWith`, its ephemeral X25519 key imported from the fixed
 * scalar (PKCS #8), its ML-KEM-768 encapsulation from
 * `ml_kem768.encapsulate(publicKey, seed)` in `@noble/post-quantum` 0.6.1,
 * and Alice's signing key (Ed25519 is deterministic). Every intermediate
 * value was checked against a rebuild with `node:crypto` when they were
 * made, and the test rebuilds them again. A change to any format here
 * changes these values, which is the point: they pin the formats.
 */

export const RELEASE_ENVELOPE_VECTOR = {
    /** Fixed inputs. */
    releaseId: '7e1f0d2c-3b4a-4596-8a7b-6c5d4e3f2a1b',
    message: 'Vector release message — synthetic, it protects nothing. ✓',
    /** K, hex. Synthetic: it seals nothing real. */
    contentKey: 'e0e1e2e3e4e5e6e7e8e9eaebecedeeeff0f1f2f3f4f5f6f7f8f9fafbfcfdfeff',
    contentNonce: 'c0c1c2c3c4c5c6c7c8c9cacb',
    /** The message is padded to this many bytes. */
    paddedLength: 1024,
    /** The content's associated data, hex. */
    associatedDataHex:
        '626c61636b6f75742d72656c656173652d636f6e74656e742d763100002437653166306432632d336234612d343539362d386137622d366335643465336632613162002430623666356138652d376331642d346532662d396133622d356334643665376638613931',
    /** SHA-256 of the content nonce and ciphertext, hex. */
    contentHash: '700f23f868cb6df60db2f8dfaaac8c35da2d85c5f1bad92c7825e4eaa30ac8e2',
    /** The header every recipient receives. */
    header: {
        v: 1 as const,
        releaseId: '7e1f0d2c-3b4a-4596-8a7b-6c5d4e3f2a1b',
        ownerAccountId: '0b6f5a8e-7c1d-4e2f-9a3b-5c4d6e7f8a91',
        ownerFingerprint: '489960939b1fb7adcce80edde0c7ad0c9ca44e25868a78156dc51d8ef623ad87',
        contentNonce: 'wMHCw8TFxsfIycrL',
        contentCiphertext:
            'mu23eyuz8KvoBYWpHd1KbG7RbFNtJDE55/f5VmD5doBYufGkTBtYt6XQSQSeCyDFssepbR/RmEgONmWQlpFt4H+XcoNFjPwhJKKFTuPssX8cAngnMwP3Lwi1Hvty9vDvDUDX5PHL0e+Yeu0SRyUhcZTW2T+poSmfmonQWlIi2rflCTBRh1TqcmgdE+KrA2McV1JhGwq18teml9513BmJtqvXVc763cKa4Fm9yfP3SlKh5ltMhSDWpK7fCgNFSHa4jyGYgrCdWl/KsYNeeE8luVOlQOnv+ylbEU35xrGAe5N8VlaTBHUSLQD9Gl4Z3MiLQQmjNruObjhsnaWCPnk9MD08yIkOHCgYWoP+Yc98qrpSTNJHavpOPyEcxNjtJJBw5qwx8015WF5gt13V/uLqEc8HrtQk9/u144FByD/vGKBkPhekydy6VTc+tssCsBjUWUXovrXFuaGzqJ5GwPW5KKh2EvtC1hD6cVcP5yFiNz1jBhCqZcSX78pxg43yLklSaJzbRvuYlO3T2CYCXH+gDOYaQhQ0ARUK0JSYrTo3B7Gj/EEAvT/h/iysEgnjzI5JGmCIk2TShG7mq4VjrZR6dnkIdd+++dJvN+415XKg6odhfiOMGWOsQlHHR03Gk+U+Vud8iCCaFK+AGlurH41y6iEa3LIpDCUqY3DnbrrDN/dzs5TnjjHgdQW8tJD4zWebAp2wqtt0T+Q2mzO0SaMaMlXHtiIc60x56c7RTrFarthiTA8+DcT4eEnKZQvUSE1ILHdM5mfSBrjxpY/gpLZRbb5LTDIlWGecsTISJhOk3wHdRW0sIYcEivXa6P8eSKB1cUgaD8wGB9Hg7cvtXGUsqeo1WeYrwjHgucP1LOfCuIeTN78QLRYf9baE6utNRe3pbg4V+QULcWHtPWFk/DbRaiHD32qZz2ouRq8/RsNmNZVk3baQpgytm+i7U6wPCg90Rc04oPT0ka0QR8hChHeuQVssWe/L2DEcKPLzUZMT0pWH0kyUnup5Tk7rKJKGvD6/Hos/X0bH+JwYQabiUlcSIrtkb9E3lzj4omGQa9IcSiUczPuiV/ds36Zuc1G0oPKeI7wsFBKz2IenLhSkEjka+kgamHYzNEnX93gd+aVYzaL9+f5j1mVWcafPxHYgOE9ZExuj/HVjZ2lrAo98G9PKjvG2lD5thGTVfdLBx1C/FCmF7npu2Wkak3sCnKAtj3ijD6DwojXRwohNOHNUC+iqKAuoJwQRmAtBGqOkBlkhXm3v/E/SvKkUs+QRi8nTn7Z/9vx9+UNEDYjFpzyxqgWH7Bf0GkFVvXcGLvfH2ySVztYSqKlEA9xu6atj94Wm638EhMM9GrY+OX2Tws864f+TZhMiQpRaT/icoCrebeYD+PQ=',
        keyCommitment: '/ClBvFqZSagMIqjvRnfwvGa90WYkW/y6jHAxIuaXQFo=',
    },
    copies: {
        /** Alice's own copy: the one re-sealing opens. */
        alice: {
            /** Fixed inputs. */
            ephemeralX25519Scalar:
                '101112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f',
            mlkemEncapsulationSeed:
                '303132333435363738393a3b3c3d3e3f404142434445464748494a4b4c4d4e4f',
            wrapNonce: 'd0d1d2d3d4d5d6d7d8d9dadb',
            /** The ephemeral X25519 public key, base64. */
            ephemeralPublicKey: '2J47rXlDfb7Z+ENBgwT0YP8Fx/6B/kqVd6gEy5Nn/2Y=',
            /** The seal transcript, hex. */
            transcriptHex:
                '626c61636b6f75742d72656c656173652d7365616c2d763100002437653166306432632d336234612d343539362d386137622d366335643465336632613162002430623666356138652d376331642d346532662d396133622d356334643665376638613931489960939b1fb7adcce80edde0c7ad0c9ca44e25868a78156dc51d8ef623ad87002430623666356138652d376331642d346532662d396133622d356334643665376638613931489960939b1fb7adcce80edde0c7ad0c9ca44e25868a78156dc51d8ef623ad87',
            /** X25519(ephemeral, recipient), hex. */
            x25519SharedSecret: '959fece8b6bd813770767a309fdd40565f9b385d50e2eba47182a1417af4b410',
            /** SHA-256 of the ML-KEM-768 ciphertext, hex (the ciphertext itself is in the sealed copy). */
            mlkemCiphertextSha256:
                '60885c6e108e2e765368a23a7876fa49006bf41254f2c0ad8138335fc31feafc',
            /** The ML-KEM-768 shared secret, hex. */
            mlkemSharedSecret: 'cf2623acded1848db20a2dcd11cfe4038271ad89639091ce365eee0a16b75e10',
            /** HKDF-SHA-256 output: the wrap key, hex. */
            wrapKey: '8ddcf299b3f56308c486eed0fbcb52f37725ef9d660d4af4c7c2731962887824',
            /** AES-256-GCM of the content key under the wrap key, hex. */
            wrappedContentKey:
                'f357dc4c4503e13861c2901ed68bf81d1df0574d93c4713ffe39f808288138599fce48542bf772bf58946af934c21e82',
            /** The signed bytes' length and SHA-256, hex. */
            signedBytesLength: 1457,
            signedBytesSha256: '5f3269d1fca7b881035ddee2e726c1fcaf2dad559d950da2ec2755221ace898b',
            /** The copy as the envelope carries it. */
            copy: {
                recipientAccountId: '0b6f5a8e-7c1d-4e2f-9a3b-5c4d6e7f8a91',
                recipientFingerprint:
                    '489960939b1fb7adcce80edde0c7ad0c9ca44e25868a78156dc51d8ef623ad87',
                sealedKey:
                    '2J47rXlDfb7Z+ENBgwT0YP8Fx/6B/kqVd6gEy5Nn/2bbeTDLSopIzYd1KpEZMggNlP9oHDnUrnmbGdFZBhucRBIPG7C2aSefby8x8XT8kjgFxVF7YeOce+ikm49yhsTiCmTA0kkOQgHNYd+CYWS+KwQ9yMvK/HKHvcOvdD0+PpuM+/tJ8aN9oe3vk4FpfJcuM7qrPeLz6qKxBAoJ9tvms99Smii91Rn5wNL0hNpkMI4T80orDcojGhmRQxYG5TdRd2lQLF3036NrnwlkF2xaNgdQvQU39EsW4Q804+BjTX3SMJaRM3vKH/7j1wI95q3jlplfsiSLheyjBDDDmzWkkeyNiAjLhf7VanQa1c6bVpL3uWRqJ/I4DF6TGZGVOnntEmi7X9HxgByx1k7GW9ZMAt9WA44pByeoMxHKkn7+bgy1Xk8h/49oynMCwKkGTAM4aT/LziCby3BR345NCOS8hQQ4K6NTzpn4DUompTI9uuQhbp+okvHEcAiMfg3Tq7VmZFYyELZQr4pzZ7bLwRrEhGTpT1RrIovDSzJt9HATpvvkiMc6+Q7QJES8WavLMWbHuUZrPZXTWCUpCDdEr9HZRjZPscCcLkibVFQ5SzN6dWlIt72eKMfl0KIsQJ9h6whBXL+CgYvgsiM8MvGdFeWlOjvHkhDzKN7q37cF92yiegEntOFL0+1gwP0+opFfUsdan0HpU4FCfyln7fR3rcoBnIJVfcp570YJPP6iVEC56GqABfy4U9eVYBDDpQbef1HioNllztQLsqXF/O3KrjO/fPTpOtcf1uZl7TU4TMbWUQ2i1fCEAfTuNepiQkjdDi7+bSnoIk/ak9tdH3aEDCtsu8PnBL8D4Ggsv209ZWsTgyq5rZ3qPbH0XUVLZVQTInpAFm3plVXiwoNUEhuxdah0GB+qFENIY2WIw2AIUbYCXNwk3YyLoaAkjV/kov64PEZDlz8TrpP0jVhrTMCoV4a0870Ql4hlxIo8FbODjmAbNH2yo7kKDwlFp3RNIdym0qgbazqM1/G2+0hb9BGX45p6KBoZgcWGRIcaIOn/WNm0WWlGED9PDFV7IfNJHk/lnenU0olrgHLFgx2nyIoSfCNwIoPfhX7UvNM6+mpEMYikIwHxkFG0d9TrwgUbYJQsh65pA2IornWLj7i/KgsLCr8HpHCsyBhQkd8DiQDGj0syqtmGMqWH8UBQhK256fWn3/u5YhmNMUZPfs3MoXNjDQYn5lxtvm424u7ySlq4YtOUUvZojELFMNxvxgZQ89NTN7IfgsNZd+L9GG9SU/z8djcpRdJ/cs1gbD8W55C/qVpmivm3b0dsDhvU7JVziPP1vvgNGYC5bjasjIiO3nL9JCv7CkPpFdWVNAdL6k514gH0P1ImAWGfXdN/Ac/nVEnSzB8MJuOOK8d4kWUMnmHBQ0eyiXfC+ONdKRcdHY940d1XR9JS32hpz71Z9Vc1PH+1wh8S7DW1E6nNGpml7Rb0DwcNd9DR0tPU1dbX2Nna2/NX3ExFA+E4YcKQHtaL+B0d8FdNk8RxP/45+AgogThZn85IVCv3cr9YlGr5NMIegg==',
                signature:
                    'kUjWLZqq7jaIf6hNOe2Vp3wZHlUMsMnZjsKbFsohrSn5ZExXag+LIwGSZcLvxsIzV6Nv5zGXYfyN+gCojAaoBg==',
            },
        },
        /** Bob's copy: the one a recipient is given. */
        bob: {
            /** Fixed inputs. */
            ephemeralX25519Scalar:
                '505152535455565758595a5b5c5d5e5f606162636465666768696a6b6c6d6e6f',
            mlkemEncapsulationSeed:
                '707172737475767778797a7b7c7d7e7f808182838485868788898a8b8c8d8e8f',
            wrapNonce: '909192939495969798999a9b',
            /** The ephemeral X25519 public key, base64. */
            ephemeralPublicKey: 'OS0XSjizsb6vrx/oJIcIQcX6UxvG6v22QCwSRmRIjBw=',
            /** The seal transcript, hex. */
            transcriptHex:
                '626c61636b6f75742d72656c656173652d7365616c2d763100002437653166306432632d336234612d343539362d386137622d366335643465336632613162002430623666356138652d376331642d346532662d396133622d356334643665376638613931489960939b1fb7adcce80edde0c7ad0c9ca44e25868a78156dc51d8ef623ad87002435653264316330622d396138662d346537642d386336622d346133663265316430633962e44155d8e3e64de1ec342392dff884d926ed623e0828ab9c4b7ded93290c11fb',
            /** X25519(ephemeral, recipient), hex. */
            x25519SharedSecret: '4bff3f094faccdd6cff29091a6454189349026a42900a79e383af49af4d07012',
            /** SHA-256 of the ML-KEM-768 ciphertext, hex (the ciphertext itself is in the sealed copy). */
            mlkemCiphertextSha256:
                'a69c34176d48df4242b60d60905034e42d330f79d2410d03a21c5332cbce9217',
            /** The ML-KEM-768 shared secret, hex. */
            mlkemSharedSecret: '922b019f919eecdda85f19a99e7e42c051edbbfb31ac481bef30015b92f2fae2',
            /** HKDF-SHA-256 output: the wrap key, hex. */
            wrapKey: 'c1b6766bba4c49e07af41d6a2dd0d72cbb35e8faf6dbbdac2b75f17e8a9d2a86',
            /** AES-256-GCM of the content key under the wrap key, hex. */
            wrappedContentKey:
                '4d28c1c563790da1eadb67b5999dfc72e3c6d6bd790bf74ad0e482bac13f7ec595714b3d0724882972bff6f2183d51f2',
            /** The signed bytes' length and SHA-256, hex. */
            signedBytesLength: 1457,
            signedBytesSha256: '0673da420900547102acbd5ab68855a99d904320b4401c5410d0513b1e769b31',
            /** The copy as the envelope carries it. */
            copy: {
                recipientAccountId: '5e2d1c0b-9a8f-4e7d-8c6b-4a3f2e1d0c9b',
                recipientFingerprint:
                    'e44155d8e3e64de1ec342392dff884d926ed623e0828ab9c4b7ded93290c11fb',
                sealedKey:
                    'OS0XSjizsb6vrx/oJIcIQcX6UxvG6v22QCwSRmRIjBxXe2xv8SS0bvkmAVmYI+1+bW+CXhog/NoPANzU2Xaj5GGBRi7ljQAqOOtwHDCdopqUpLMq2crSHwQeZ++TwAk8Z/RMRghMLZ6LXWqWpgtzsYr86ssn1Vi2EyDE+50y4w5lk9pkb2QucbO9IIbPtz9lBjwkkV2gIWhdKD7JyatR1Ec06+jsfKSYtW+YJ0ly78wOFdXy8Znjak7TfBH2NBiHqYM+d5ypr88mtEwopN5ITGTZcHeFO3pwR4PC0HW1lIXL0X8RwyyEyHHdExjvulLvmBceQTmuIENg3ujmvbIIQ7LDvoHa+HxK87Dy3Q9ht+uzX3oN0DCYcUjexgJ28LX4f2mDz9wkNQ+IiNdCscWQbpJM5JindO/im5a8ZZ7wA212bw2JDqteLDtmV2XvdbfA2ltnz1aHNwE722PogThD+M0T5KqjanR9Gzj9XLBuLOo/5oLRz1rEqy48MA1lREq+b0nXu8ZcTrlWnXYhtrJsRBXTV2wlzzldlH0Lpr/J1BdM9y5JbXebM++AnaADa3yjNsxDHbq57qSKW13no6abrj8BFbolqfVpABl/G4nfJtqPZbMt4tc4uWIXt0MuBAuq55X6VvC+QxnLDVBwf+eSVrpMpyhRq4OxxL/vvOC1L5spANNFTfj7ALd1p+DqxrWbbR38zvvow6No17NyKjxgldg8HaMrz5sjSly0ZFr6dAVMHIJA7OdY6z4oXYrE7WMsqo3ZUFRJMVsslrqr+/ezFRIaoYphqmtBL7Pp1uOjHZBfAf0AJdKPRyba44mC+Pqy5DqJ4CUm48iR4Dkzt27nB7sigAvcasrdJmhRpCY47gpwQcUmcjEZrwqAUoZbj03++tiuw3Kv6He9WKhtKHMTxqxxt6iE5KF7GZMCjnO9iXpvw3F7PqlOTyUVwXvllcjLWShNIYSpi0+c1J9x5aqxqt02Rob6MoetIBpleW2DWknG6kHhckqw7P6ejBX+0JaVmCD2wo6gghGSZU6yPTVCTbXO/O8Sj7Pa+zqPN3++Y82nis56/n35uMg3iVSxeQ3LNAumY7s8uqXPDWklIW+qkVFElhXMtqH5ZXJtQawzQ8tGZR5gjbzTSO9ObILmUOMMZ3/QII34N0fQmzb65EqlcGKdk1BiAj50o/sLl065iZ4+Ds9rjV8q/kpDSTZNVZT0A77LGHyFN8SGCH+798aG1V2mAX1JVW7X/RQE7/bo789Ekr9rI0nF2/UCL76BNPyuIOJdlSx+KlNpmcirgMTkZDfmgiIVdKrriKDJVqzM8dTchC1F4tTpoxswrAjJbB7hrOczdNL3+iELwje1pGvRbddMhEw+YQ0rtYHcdWF0XgCJXEL0uDrxYOvu1/fu/GzYxuhyW1rUmIddEipEb6LJxtPdGA1g+334Ga8yemWTVfXgIDeu2PqeMgEqwnHL7i9gZfxh4IloUksauoTI8JlFnJCRkpOUlZaXmJmam00owcVjeQ2h6ttntZmd/HLjxta9eQv3StDkgrrBP37FlXFLPQckiClyv/byGD1R8g==',
                signature:
                    'SvB2Osm1HC3pMHqgvBz0Afwk/Ovpw2i4JtdSLhBeCfTde/ekmbHc+Lam2eB8Lo0bw9uBckTlb6ACu5nrbyH7Aw==',
            },
        },
    },
};
