const fs = require('fs');
const Dropbox = require('dropbox');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

class DropData {
  constructor(options) {
    // this.adapter = new FileSync(`${options.path}/${options.name}.json`);
    // this.db = low(this.adapter);

    this._options = options;
    this._filename = `${this._options.name}.json`;

    this._dbx = new Dropbox({
      accessToken: options.accessToken
    });

    this.syncFromRemote(this._options.path, this._options.name);
  }

  async syncFromRemote(path, name) {
    let localFilePath = `${path}/${name}.json`;
    let remoteFilePath = `${path}/${name}.remote.json`;
    let filesListFolderRes = await this._dbx.filesListFolder({ path: '' });

    filesListFolderRes.entries.forEach(async item => {
      if (item.name === this._filename) {
        let filesDownloadRes = await this._dbx.filesDownload({ path: '/' + this._filename });

        fs.writeFileSync(remoteFilePath, filesDownloadRes.fileBinary);

        console.log(filesDownloadRes.fileBinary);
      }
    });

    console.log(filesListFolderRes);
  }
}

module.exports = DropData;

let dd = new DropData({
  accessToken: '',
  path: '/tmp',
  name: 'storage'
});
