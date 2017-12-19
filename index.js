const fs = require('fs');
const moment = require('moment');
const low = require('lowdb');
const Dropbox = require('dropbox');
const FileSync = require('lowdb/adapters/FileSync');

class DropData {
  constructor(options) {
    // this.adapter = new FileSync(`${options.path}/${options.name}.json`);
    // this.db = low(this.adapter);

    this._options = options;
    this._dbx = new Dropbox({
      accessToken: options.accessToken
    });

    this.looper();
  }

  async sync(path, name) {
    let localeFilePath = `${path}/${name}.json`;
    let localeVersionPath = `${path}/${name}.version`;

    let localeFileExisted = false;
    let remoteFileExisted = false;

    let localeFileVersion = 0;
    let remoteFileVersion = 0;

    let filesListFolderRes = await this._dbx.filesListFolder({ path: '' });

    // Read locale file.
    if (fs.existsSync(localeFilePath)) {
      localeFileExisted = true;
    }

    // Read remote file.
    for (let i = filesListFolderRes.entries.length; i--;) {
      if (filesListFolderRes.entries[i].name === this._options.name + '.json') {
        let _versionDownloadRes = await this._dbx.filesDownload({ path: `/${this._options.name}.version` });

        remoteFileExisted = true;
        remoteFileVersion = parseInt(_versionDownloadRes.fileBinary);
      }
    }

    if (this._options.debug) {
      console.log(`* localeFileExisted: ${localeFileExisted ? 'yes' : 'no'}`);
      console.log(`* remoteFileExisted: ${remoteFileExisted ? 'yes' : 'no'}`);
    }

    if (localeFileExisted) {
      if (remoteFileExisted) {
        // Compare.
        localeFileVersion = parseInt(fs.readFileSync(localeVersionPath));

        if (this._options.debug) {
          console.log(`* localeFileVersion: ${localeFileVersion}`);
          console.log(`* remoteFileVersion: ${remoteFileVersion}`);
        }

        if (localeFileVersion > remoteFileVersion) {
          await this.syncToRemote(path, name);
        } else if (localeFileVersion < remoteFileVersion) {
          await this.syncFromRemote(path, name);
        }
      } else {
        // Upload to remote.
        await this.syncToRemote(path, name);
      }
    } else {
      if (remoteFileExisted) {
        // Download to locale.
        await this.syncFromRemote(path, name);
      } else {
        // Create locale file and upload to remote.
        await this.initDataFile(path, name);
      }
    }
  }

  async syncFromRemote(path, name) {
    // Download to locale.
    let _fileDownloadRes = await this._dbx.filesDownload({ path: `/${this._options.name}.json` });
    let _versionDownloadRes = await this._dbx.filesDownload({ path: `/${this._options.name}.version` });

    // Yes, yes, yes.
    fs.writeFileSync(`/${path}/${name}.json`, _fileDownloadRes.fileBinary);
    fs.writeFileSync(`/${path}/${name}.version`, _versionDownloadRes.fileBinary);
  }

  async syncToRemote(path, name) {
    // Delete remote files.
    try {
      await this._dbx.filesDeleteBatch({
        entries: [
          { path: `/${name}.json` },
          { path: `/${name}.version` }
        ]
      });
    } catch (error) {
      console.log(error);
    }

    // Upload.
    await this._dbx.filesUpload({
      path: `/${name}.json`,
      contents: fs.readFileSync(`${path}/${name}.json`)
    });

    await this._dbx.filesUpload({
      path: `/${name}.version`,
      contents: fs.readFileSync(`${path}/${name}.version`)
    });
  }

  async initDataFile(path, name) {
    let localeFilePath = `${path}/${name}.json`;
    let localeVersionPath = `${path}/${name}.version`;

    // Create locale file.
    fs.writeFileSync(localeFilePath, JSON.stringify({}));
    fs.writeFileSync(localeVersionPath, 1);

    // Upload to remote.
    await this.syncToRemote(path, name);
  }

  looper() {
    let _processer = () => {
      this.sync(this._options.path, this._options.name);
    };

    setInterval(_processer.bind(this), 20000);

    _processer();
  }
}

module.exports = DropData;

let dd = new DropData({
  accessToken: '',
  path: '/tmp',
  name: 'yumonth-storage',
  debug: true
});
