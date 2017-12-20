const fs = require('fs');
const low = require('lowdb');
const Dropbox = require('dropbox');
const FileSync = require('lowdb/adapters/FileSync');

class DropData {
  constructor(options) {
    this._version = 0;
    this._options = options;
    this._dbx = new Dropbox({
      accessToken: options.accessToken
    });

    this.looper();
  }

  async sync() {
    let { path, name } = this._options;
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
      this._version = parseInt(fs.readFileSync(localeVersionPath));
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
          await this.syncToRemote();
        } else if (localeFileVersion < remoteFileVersion) {
          await this.syncFromRemote();
        }
      } else {
        // Upload to remote.
        await this.syncToRemote();
      }
    } else {
      if (remoteFileExisted) {
        // Download to locale.
        await this.syncFromRemote();
      } else {
        // Create locale file and upload to remote.
        await this.initDataFile();
      }
    }
  }

  async syncFromRemote() {
    let { path, name } = this._options;

    // Download to locale.
    let _fileDownloadRes = await this._dbx.filesDownload({ path: `/${name}.json` });
    let _versionDownloadRes = await this._dbx.filesDownload({ path: `/${name}.version` });

    // Update local version.
    this._version = parseInt(_versionDownloadRes.fileBinary);

    // Yes, yes, yes.
    fs.writeFileSync(`/${path}/${name}.json`, _fileDownloadRes.fileBinary);
    fs.writeFileSync(`/${path}/${name}.version`, _versionDownloadRes.fileBinary);
  }

  async syncToRemote() {
    let { path, name } = this._options;

    // Delete remote files.
    await this._dbx.filesDeleteBatch({
      entries: [
        { path: `/${name}.json` },
        { path: `/${name}.version` }
      ]
    });

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

  async initDataFile() {
    let { path, name } = this._options;
    let localeFilePath = `${path}/${name}.json`;
    let localeVersionPath = `${path}/${name}.version`;

    // Update local version.
    this._version = 1;

    // Create locale file.
    fs.writeFileSync(localeFilePath, JSON.stringify({}));
    fs.writeFileSync(localeVersionPath, this._version);

    // Upload to remote.
    await this.syncToRemote();
  }

  bindWrite() {
    let { path, name } = this._options;
    let localeVersionPath = `${path}/${name}.version`;

    this._write = this.db.write.bind(this.db);

    return () => {
      this._version++;
      this._write();

      fs.writeFileSync(localeVersionPath, this._version);
    };
  }

  looper() {
    let { path, name } = this._options;
    let _processer = async () => {
      await this.sync();

      if (!this.adapter) {
        this.adapter = new FileSync(`${path}/${name}.json`);
        this.db = low(this.adapter);
        this.db.write = this.bindWrite();
      }
    };

    setInterval(_processer.bind(this), 20000);

    _processer();
  }
}

module.exports = DropData;
