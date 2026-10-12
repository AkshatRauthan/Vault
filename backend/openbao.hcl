
ui = true

api_addr     = "https://openbao:8200"
cluster_addr = "https://openbao:8201"

storage "raft" {
    path    = "/openbao/data"
    node_id = "vault-openbao-1"
}

listener "tcp" {
    address         = "0.0.0.0:8200"
    cluster_address = "0.0.0.0:8201"

    tls_cert_file   = "/bao/tls/server.crt"
    tls_key_file    = "/bao/tls/server.key"
    tls_min_version = "tls12"
}
