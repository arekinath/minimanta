# Mini Manta

A small object store service that implements portions of the [Manta][manta] API
in a single zone. Unlike Manta, this service provides *no resiliency* beyond
that provided by the underlying ZFS pool. There are not multiple copies.
There is no HA.

[manta]: https://github.com/joyent/manta

This service is for those who want or need the convenience of Manta, without
the overhead of installing a full Manta.

Some good use cases:

* Manta backing for imgapi
* Triton SDC log uploads to manta
* People who wanta manta-like experience at home, but don't have the necessary
  hardware to devote to a manta installation.

## Requirements

1. A `joyent` or `joyent-minimal` brand zone instance on SmartOS.
   * A delegated dataset is recomended
2. `node.js` version 10.x or earlier
3. `nginx` installed (for mime type lookup).
   * Alternatively, provide your own mime.types file.

## Getting started

```shell
git clone https://github.com/arekinath/minimanta.git
cd minimanta
make install
```

## Authentication

User keys are stored in the user's `keys` directory under the manta root. It
will be the same path as the `keyId` value from the auth header. E.g., if
`config.json` specifies `root` as `/manta`, then for a user `fbulsara`, with a
key id `b8:74:38:e8:69:75:30:9d:c7:cd:7e:d9:a6:e1:01:c8`, copy their
`id_ecdsa.pub` to

```ls
/manta/fbulsara/keys/b8:74:38:e8:69:75:30:9d:c7:cd:7e:d9:a6:e1:01:c8
```

After a users's first key is created, they can use that key to authenticate and
`PUT` or `DELETE` keys for self-service key management.

### Operators

Operator accounts can read/write any object in manta via the API. To designate
an operator, you need to edit the `minimanta.json` file in the *resource fork*
of the user's manta directory. To designate a user, `fbulsara`, as an operator
run:

```shell
runat /manta/fbulsara vi minimanta.json
```

Add the key `"operator":true`, save and exit. The user can now read/write any
directory or object.

## Supported API Surface

`minimanta` implements the **directory object API only**. The following
Manta cli commands are expected to work.

* `mchattr`
* `mfind`
* `mget`
* `minfo`
* `mls`
* `mmd5`
* `mmkdir`
* `mput`
* `mrm`
* `mrmdir`
* `msign`
* `muntar`

See the [Manta API Storage Reference][manta-api] for details about the API.
Note that there may be undocumented divergences or bugs in behavior.

[manta-api]: https://apidocs.joyent.com/manta/storage-reference.html

### Unsupported API Surface

The following are not (nor will they ever be) supported:

* jobs
* snaplinks
* multi-part upload
* garbage collection (because deletes are processed in real time by removing
  objects from the filesystem)
* RBAC (and thus cross-account authorization)
* multiple copies

This is not an exhaustive list.

## TLS

Minimanta itself does not do TLS. It is recomended to use `nginx` as a front
end load balancer that handles TLS authentication. You can have an added
benefit of enabling caching in nginx to speed up reads of frequently accessed
files.

An example nginx config is provided in the examples directory.

You may also use a different front end such as Apache or HAproxy.

## Bugs

Probably some.
